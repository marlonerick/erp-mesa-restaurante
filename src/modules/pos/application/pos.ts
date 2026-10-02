import { recordAuditFromContext } from '@/modules/audit';
import type { PaymentMethod } from '@/modules/cashier';
import type { ItemRecord, OrderRecord } from '@/modules/orders';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { executeIdempotent, type Jsonified } from '@/shared/idempotency/idempotency';
import {
  DomainError,
  hasPermission,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import {
  type BillTotals,
  cashSplit,
  computeBill,
  type DiscountMode,
  discountFromInput,
  exceedsLimit,
  fitShares,
  itemShares,
  lineGross,
  paymentAmount,
  paymentReference,
  posErrors,
  reasonText,
} from '../domain/rules';
import type { PaymentRecord, PosDependencies } from './ports';

// ---- Apoio ----

async function activeStore(deps: PosDependencies, tx: Transaction, ctx: RequestContext) {
  const found = await deps.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw posErrors.storeNotFound();
}

function requireReader(ctx: RequestContext) {
  if (!hasPermission(ctx, 'payments.create') && !hasPermission(ctx, 'cashier.read')) {
    requirePermission(ctx, 'payments.create');
  }
}

/**
 * Trava a conta como PRIMEIRA leitura da transação (RN-POS-16, ADR-0008) e confere a loja. Depois
 * dela, as leituras comuns (itens, pagamentos) já veem o que outro caixa ou garçom confirmou.
 */
async function lockOpenOrder(
  deps: PosDependencies,
  tx: Transaction,
  ctx: RequestContext,
  orderId: Id,
): Promise<OrderRecord> {
  const order = await deps.orders.lockOrder(tx, ctx.storeId, orderId);
  await activeStore(deps, tx, ctx);
  if (order.status !== 'ABERTO') throw posErrors.orderNotOpen();
  return order;
}

const totalsOf = (order: OrderRecord, items: readonly ItemRecord[]) => computeBill(order, items);

function requireNoPending(items: readonly ItemRecord[]) {
  if (items.some((item) => item.status === 'PENDENTE')) throw posErrors.pendingItems();
}

// ---- Leitura ----

export interface Receivable {
  readonly orderId: Id;
  readonly number: number;
  readonly type: 'MESA' | 'BALCAO';
  readonly label: string;
  readonly openedAt: Date;
  readonly pendingCount: number;
  readonly prebillAt: Date | null;
  readonly totals: BillTotals;
}

/** Contas abertas da loja com total, pago e o que falta (RN-POS-02). */
export async function receivables(
  deps: PosDependencies,
  ctx: RequestContext,
): Promise<Receivable[]> {
  requireReader(ctx);
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const open = await deps.orders.listOpenOrders(tx, ctx.storeId);
    return open.map((order) => {
      // `subtotalCents` do resumo é o bruto dos itens não cancelados
      const itemsCents = order.subtotalCents;
      const totals = computeBill(order, [
        {
          id: order.id,
          status: 'ENVIADO',
          unitPriceCents: itemsCents,
          modifiersCents: 0,
          quantity: 1,
          discountCents: order.itemDiscountsCents,
        },
      ]);
      return {
        orderId: order.id,
        number: order.number,
        type: order.type,
        label: order.label,
        openedAt: order.openedAt,
        pendingCount: order.pendingCount,
        prebillAt: order.prebillAt,
        totals,
      };
    });
  });
}

export interface BillPayment extends PaymentRecord {
  readonly createdByName: string | null;
}

export interface BillDetail {
  readonly order: OrderRecord;
  readonly items: (ItemRecord & { readonly lineCents: number; readonly paid: boolean })[];
  readonly payments: BillPayment[];
  readonly totals: BillTotals;
}

async function billOf(
  deps: PosDependencies,
  tx: Transaction,
  order: OrderRecord,
): Promise<BillDetail> {
  // A conta já veio da loja ativa: as leituras seguintes filtram pela mesma loja (ADR-0009)
  const scope = { storeId: order.storeId, orderId: order.id };
  const items = await deps.orders.listItems(tx, scope.storeId, order.id);
  const payments = await deps.repo.listPayments(tx, scope);
  const allocated = await deps.repo.listAllocatedItemIds(tx, scope);
  const names = await deps.userNames(tx, [...new Set(payments.map((item) => item.createdBy))]);
  return {
    order,
    items: items.map((item) => ({
      ...item,
      lineCents: item.status === 'CANCELADO' ? 0 : lineGross(item),
      paid: allocated.has(item.id),
    })),
    payments: payments.map((item) => ({
      ...item,
      createdByName: names.get(item.createdBy) ?? null,
    })),
    totals: totalsOf(order, items),
  };
}

export async function bill(
  deps: PosDependencies,
  ctx: RequestContext,
  orderId: Id,
): Promise<BillDetail> {
  requireReader(ctx);
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const order = await deps.orders.findOrder(tx, ctx.storeId, orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND', 'Conta não encontrada.', 'NOT_FOUND');
    return billOf(deps, tx, order);
  });
}

/** Limite de desconto de quem está usando, em pontos-base (para a tela pedir o PIN antes). */
export async function myDiscountLimit(deps: PosDependencies, ctx: RequestContext): Promise<number> {
  if (!hasPermission(ctx, 'discounts.apply')) return 0;
  return runInTransaction(deps.db, (tx) => deps.discountLimit(tx, ctx.userId, ctx.storeId));
}

// ---- Pré-conta (RN-POS-04) ----

export async function preBill(
  deps: PosDependencies,
  ctx: RequestContext,
  input: { orderId: Id },
): Promise<BillDetail> {
  requirePermission(ctx, 'payments.create');
  return runInTransaction(deps.db, async (tx) => {
    const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
    requireNoPending(await deps.orders.listItems(tx, ctx.storeId, order.id));
    const at = ctx.clock.now();
    await deps.orders.updateBill(
      tx,
      { storeId: ctx.storeId, orderId: order.id },
      { prebillAt: at },
    );
    await deps.orders.markPaying(tx, ctx, order);
    const detail = await billOf(deps, tx, { ...order, prebillAt: at });
    await recordAuditFromContext(tx, ctx, 'PRE_BILL_ISSUED', {
      entityType: 'customer_order',
      entityId: order.id,
      after: { order: order.number, totalCents: detail.totals.totalCents },
    });
    return detail;
  });
}

// ---- Descontos e taxa (RN-POS-05 a RN-POS-07) ----

/**
 * Libera o desconto (RN-POS-05): com `discounts.apply`, dentro do limite do perfil; acima dele, ou
 * para quem NÃO tem `discounts.apply` — inclusive para RETIRAR um desconto (valor zero) —, só com
 * `discounts.apply_above_limit` ou PIN do gerente (achado B-1 da revisão da Etapa 8).
 */
async function authorizeDiscount(
  deps: PosDependencies,
  tx: Transaction,
  ctx: RequestContext,
  discount: { cents: number; baseCents: number; grantToken: string | null },
) {
  const canDiscount = hasPermission(ctx, 'discounts.apply');
  const limit = canDiscount ? await deps.discountLimit(tx, ctx.userId, ctx.storeId) : 0;
  if (canDiscount && !exceedsLimit(discount.cents, discount.baseCents, limit)) {
    return { authorizerUserId: null, limitBp: limit };
  }
  const outcome = await deps.authorizeOrElevate(
    tx,
    ctx,
    'discounts.apply_above_limit',
    discount.grantToken,
  );
  return { authorizerUserId: outcome.authorizerUserId, limitBp: limit };
}

export interface DiscountInput {
  readonly orderId: Id;
  readonly mode: DiscountMode;
  /** Centavos (VALOR) ou pontos-base (PERCENTUAL). */
  readonly value: number;
  readonly reason: string;
  readonly grantToken?: string | null;
}

export async function discountOrder(
  deps: PosDependencies,
  ctx: RequestContext,
  input: DiscountInput,
): Promise<void> {
  await runInTransaction(deps.db, async (tx) => {
    const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
    if (order.paidCents > 0) throw posErrors.paymentsStarted();
    const totals = totalsOf(order, await deps.orders.listItems(tx, ctx.storeId, order.id));
    const cents = discountFromInput(input.mode, input.value, totals.subtotalCents);
    const reason = cents === 0 ? null : reasonText(input.reason, 'DISCOUNT_REASON_REQUIRED');
    const { authorizerUserId } = await authorizeDiscount(deps, tx, ctx, {
      cents,
      baseCents: totals.subtotalCents,
      grantToken: input.grantToken ?? null,
    });
    await deps.orders.updateBill(
      tx,
      { storeId: ctx.storeId, orderId: order.id },
      { discountCents: cents, discountReason: reason },
    );
    await recordAuditFromContext(tx, ctx, 'DISCOUNT_APPLIED', {
      entityType: 'customer_order',
      entityId: order.id,
      authorizerUserId,
      before: { discountCents: order.discountCents },
      after: { order: order.number, discountCents: cents, baseCents: totals.subtotalCents, reason },
    });
  });
}

export async function discountItem(
  deps: PosDependencies,
  ctx: RequestContext,
  input: DiscountInput & { itemId: Id },
): Promise<void> {
  await runInTransaction(deps.db, async (tx) => {
    const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
    if (order.paidCents > 0) throw posErrors.paymentsStarted();
    const item = (await deps.orders.listItems(tx, ctx.storeId, order.id)).find(
      (candidate) => candidate.id === input.itemId,
    );
    if (!item) throw posErrors.itemNotFound();
    if (item.status === 'CANCELADO') throw posErrors.itemCancelled();
    const base = lineGross(item);
    const cents = discountFromInput(input.mode, input.value, base);
    const reason = cents === 0 ? null : reasonText(input.reason, 'DISCOUNT_REASON_REQUIRED');
    const { authorizerUserId } = await authorizeDiscount(deps, tx, ctx, {
      cents,
      baseCents: base,
      grantToken: input.grantToken ?? null,
    });
    await deps.orders.setItemDiscount(
      tx,
      { storeId: ctx.storeId, itemId: item.id },
      { cents, reason },
    );
    // Muda a versão da conta: a tela de quem estava com a conta aberta é atualizada
    await deps.orders.updateBill(tx, { storeId: ctx.storeId, orderId: order.id }, {});
    await recordAuditFromContext(tx, ctx, 'DISCOUNT_APPLIED', {
      entityType: 'order_item',
      entityId: item.id,
      authorizerUserId,
      before: { discountCents: item.discountCents },
      after: { order: order.number, product: item.productName, discountCents: cents, reason },
    });
  });
}

export async function serviceFee(
  deps: PosDependencies,
  ctx: RequestContext,
  input: { orderId: Id; waived: boolean; reason: string; grantToken?: string | null },
): Promise<void> {
  await runInTransaction(deps.db, async (tx) => {
    const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
    if (order.type === 'BALCAO') throw posErrors.noServiceFee();
    if (order.paidCents > 0) throw posErrors.paymentsStarted();
    const reason = reasonText(input.reason, 'DISCOUNT_REASON_REQUIRED');
    if (order.serviceFeeWaived === input.waived) return;
    const { authorizerUserId } = await deps.authorizeOrElevate(
      tx,
      ctx,
      'discounts.apply_above_limit',
      input.grantToken ?? null,
    );
    await deps.orders.updateBill(
      tx,
      { storeId: ctx.storeId, orderId: order.id },
      { serviceFeeWaived: input.waived },
    );
    await recordAuditFromContext(
      tx,
      ctx,
      input.waived ? 'SERVICE_FEE_REMOVED' : 'SERVICE_FEE_RESTORED',
      {
        entityType: 'customer_order',
        entityId: order.id,
        authorizerUserId,
        after: { order: order.number, serviceFeeBp: order.serviceFeeBp, reason },
      },
    );
  });
}

// ---- Pagamentos (RN-POS-08 a RN-POS-14) ----

export interface PayInput {
  readonly orderId: Id;
  readonly method: PaymentMethod;
  /** Dinheiro: quanto o cliente ENTREGOU; outras formas: o valor do pagamento. */
  readonly amountCents: number | null;
  readonly reference?: string | null;
  /** Divisão por itens: os itens que este pagamento quita. */
  readonly itemIds?: readonly Id[];
  readonly idempotencyKey: string;
}

export interface PayResult {
  readonly paymentId: Id;
  readonly amountCents: number;
  readonly changeCents: number;
  readonly closed: boolean;
}

export async function pay(
  deps: PosDependencies,
  ctx: RequestContext,
  input: PayInput,
): Promise<Jsonified<PayResult>> {
  requirePermission(ctx, 'payments.create');
  const reference = paymentReference(input.reference);
  const itemIds = [...new Set(input.itemIds ?? [])].sort();
  const outcome = await runInTransaction(deps.db, (tx) =>
    executeIdempotent<PayResult>(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'pos.pay',
        payload: {
          orderId: input.orderId,
          method: input.method,
          amount: input.amountCents,
          reference,
          itemIds,
        },
      },
      async () => {
        const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
        const items = await deps.orders.listItems(tx, ctx.storeId, order.id);
        requireNoPending(items);
        const session = await deps.cashier.lockOpenSession(tx, ctx);
        const totals = totalsOf(order, items);
        if (totals.balanceCents <= 0) throw posErrors.nothingToPay();

        // Quanto abate: divisão por itens (parte dos itens) ou o valor digitado
        let shares: { itemId: string; amountCents: number }[] = [];
        let due: number;
        if (itemIds.length > 0) {
          const allocated = await deps.repo.listAllocatedItemIds(tx, {
            storeId: ctx.storeId,
            orderId: order.id,
          });
          const selected = itemIds.map((id) => items.find((item) => item.id === id));
          if (selected.some((item) => item === undefined || item.status === 'CANCELADO')) {
            throw posErrors.itemNotFound();
          }
          if (itemIds.some((id) => allocated.has(id))) throw posErrors.itemAlreadyPaid();
          shares = itemShares(
            totals,
            selected.filter((item): item is ItemRecord => item !== undefined),
          );
          const sharesTotal = shares.reduce((sum, share) => sum + share.amountCents, 0);
          // Marcou TODOS os itens que faltam: cobra exatamente o que falta (sem sobrar centavo,
          // mesmo depois de um pagamento por valor — achado I-1 e S-3 da revisão)
          const remaining = items.filter(
            (item) => item.status !== 'CANCELADO' && !allocated.has(item.id),
          );
          const coversAll = remaining.every((item) => itemIds.includes(item.id));
          if (coversAll) {
            due = totals.balanceCents;
          } else if (sharesTotal > totals.balanceCents) {
            throw posErrors.itemsExceedBalance();
          } else {
            due = sharesTotal;
          }
          // Itens que valem zero (desconto de 100%) não geram pagamento
          if (due <= 0) throw posErrors.nothingToPay();
          shares = fitShares(shares, due);
        } else {
          due = paymentAmount(input.amountCents);
        }

        // Troco só no dinheiro (RN-POS-09): o cliente entrega `tendered`; abate até `limit`
        let amountCents = due;
        let tenderedCents: number | null = null;
        let changeCents: number | null = null;
        if (input.method === 'DINHEIRO') {
          const byItems = itemIds.length > 0;
          const tendered = byItems ? paymentAmount(input.amountCents ?? due) : due;
          // Na divisão por itens o dinheiro entregue precisa cobrir a parte dos itens
          if (byItems && tendered < due) throw posErrors.tenderedTooLow();
          const split = cashSplit(tendered, byItems ? due : totals.balanceCents);
          amountCents = split.appliedCents;
          tenderedCents = tendered;
          changeCents = split.changeCents;
        } else if (due > totals.balanceCents) {
          throw posErrors.exceedsBalance();
        }

        const paymentId = newId();
        const now = ctx.clock.now();
        await deps.repo.insertPayment(tx, {
          id: paymentId,
          storeId: ctx.storeId,
          orderId: order.id,
          cashSessionId: session.id,
          method: input.method,
          amountCents,
          tenderedCents,
          changeCents,
          reference,
          createdBy: ctx.userId,
          createdAt: now,
        });
        // A parte de cada item (já ajustada para somar o valor do pagamento)
        await deps.repo.insertAllocations(tx, paymentId, shares);
        await deps.cashier.recordSale(tx, ctx, {
          sessionId: session.id,
          method: input.method,
          amountCents,
          paymentId,
        });
        const paidCents = order.paidCents + amountCents;
        await deps.orders.updateBill(
          tx,
          { storeId: ctx.storeId, orderId: order.id },
          { paidCents },
        );
        if (order.paidCents === 0) await deps.orders.markPaying(tx, ctx, order);
        await recordAuditFromContext(tx, ctx, 'PAYMENT_CREATED', {
          entityType: 'payment',
          entityId: paymentId,
          after: {
            order: order.number,
            method: input.method,
            amountCents,
            changeCents,
            items: shares.length,
          },
        });
        const closed = paidCents === totals.totalCents;
        if (closed) {
          await deps.orders.closeAsPaid(tx, ctx, order, {
            itemsCents: totals.itemsCents,
            discountsCents: totals.itemDiscountsCents + totals.orderDiscountCents,
            serviceFeeCents: totals.serviceFeeCents,
            totalCents: totals.totalCents,
          });
        }
        return { paymentId, amountCents, changeCents: changeCents ?? 0, closed };
      },
    ),
  );
  return outcome.result;
}

/**
 * Conta que ficou com total zero (cortesia de 100% ou tudo cancelado): fecha sem pagamento e manda
 * a mesa para limpeza (RN-POS-12a — achado I-2 da revisão: antes ela ficava aberta para sempre).
 */
export async function closeFree(
  deps: PosDependencies,
  ctx: RequestContext,
  input: { orderId: Id },
): Promise<void> {
  requirePermission(ctx, 'payments.create');
  await runInTransaction(deps.db, async (tx) => {
    const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
    const items = await deps.orders.listItems(tx, ctx.storeId, order.id);
    requireNoPending(items);
    const totals = totalsOf(order, items);
    if (totals.totalCents !== 0 || totals.paidCents !== 0) throw posErrors.notFree();
    await deps.orders.closeAsPaid(tx, ctx, order, {
      itemsCents: totals.itemsCents,
      discountsCents: totals.itemDiscountsCents + totals.orderDiscountCents,
      serviceFeeCents: 0,
      totalCents: 0,
    });
  });
}

export async function cancelPayment(
  deps: PosDependencies,
  ctx: RequestContext,
  input: {
    orderId: Id;
    paymentId: Id;
    reason: string;
    grantToken?: string | null;
    idempotencyKey: string;
  },
): Promise<void> {
  requireReader(ctx);
  const reason = reasonText(input.reason, 'CANCEL_REASON_REQUIRED');
  await runInTransaction(deps.db, (tx) =>
    executeIdempotent(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'pos.cancelPayment',
        payload: { orderId: input.orderId, paymentId: input.paymentId, reason },
      },
      async () => {
        const order = await lockOpenOrder(deps, tx, ctx, input.orderId);
        const found = await deps.repo.findPayment(
          tx,
          { storeId: ctx.storeId, paymentId: input.paymentId },
          { forUpdate: true },
        );
        if (found?.orderId !== order.id) throw posErrors.paymentNotFound();
        if (found.status === 'CANCELADO') throw posErrors.alreadyCancelled();
        // Gerente ou PIN do gerente (E8-3), consumido nesta transação
        const { authorizerUserId } = await deps.authorizeOrElevate(
          tx,
          ctx,
          'payments.cancel',
          input.grantToken ?? null,
        );
        await deps.cashier.recordRefund(tx, ctx, {
          sessionId: found.cashSessionId,
          method: found.method,
          amountCents: found.amountCents,
          paymentId: found.id,
          reason,
          authorizedBy: authorizerUserId,
        });
        await deps.repo.cancelPayment(
          tx,
          { storeId: ctx.storeId, paymentId: found.id },
          {
            by: ctx.userId,
            at: ctx.clock.now(),
            reason,
            authorizedBy: authorizerUserId,
          },
        );
        await deps.orders.updateBill(
          tx,
          { storeId: ctx.storeId, orderId: order.id },
          { paidCents: order.paidCents - found.amountCents },
        );
        await recordAuditFromContext(tx, ctx, 'PAYMENT_CANCELLED', {
          entityType: 'payment',
          entityId: found.id,
          authorizerUserId,
          before: { status: 'ATIVO', method: found.method, amountCents: found.amountCents },
          after: { order: order.number, reason },
        });
      },
    ),
  );
}
