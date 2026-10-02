import { recordAuditFromContext } from '@/modules/audit';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { executeIdempotent, type Jsonified } from '@/shared/idempotency/idempotency';
import {
  type Id,
  newId,
  operationalDate,
  type RequestContext,
  requirePermission,
} from '@/shared/kernel';
import {
  blindCount,
  cashErrors,
  cashReason,
  type CountLine,
  expectedByMethod,
  movementAmount,
  openingAmount,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../domain/rules';
import type { CashierDependencies, CashMovementRecord, CashSessionRecord } from './ports';

async function activeStore(deps: CashierDependencies, tx: Transaction, ctx: RequestContext) {
  const found = await deps.stores.findStore(tx, ctx.storeId);
  if (found?.organizationId !== ctx.organizationId) throw cashErrors.storeNotFound();
  return found;
}

/** Terminal de CAIXA ativo vinculado a este aparelho (RN-CASH-02, E8-2); null se não houver. */
async function cashTerminal(deps: CashierDependencies, tx: Transaction, ctx: RequestContext) {
  if (ctx.deviceId === null) return null;
  const terminal = await deps.stores.terminalOfDevice(tx, ctx.storeId, ctx.deviceId);
  return terminal?.kind === 'CAIXA' ? terminal : null;
}

async function requireCashTerminal(
  deps: CashierDependencies,
  tx: Transaction,
  ctx: RequestContext,
) {
  const terminal = await cashTerminal(deps, tx, ctx);
  if (!terminal) throw cashErrors.terminalRequired();
  return terminal;
}

/** Caixa aberto deste terminal, travado e relido (RN-CASH-08). */
async function lockOpenSessionOfTerminal(
  deps: CashierDependencies,
  tx: Transaction,
  ctx: RequestContext,
): Promise<CashSessionRecord> {
  const terminal = await requireCashTerminal(deps, tx, ctx);
  const session = await deps.repo.findOpenSessionOfTerminal(
    tx,
    { storeId: ctx.storeId, terminalId: terminal.id },
    { forUpdate: true },
  );
  if (!session) throw cashErrors.notOpen();
  return session;
}

async function expectedOf(deps: CashierDependencies, tx: Transaction, session: CashSessionRecord) {
  return expectedByMethod(
    session.openingAmountCents,
    await deps.repo.movementTotals(tx, session.id),
  );
}

// ---- Leitura (sem totais de venda antes do fechamento — RN-CASH-06) ----

export interface CashMovementView extends CashMovementRecord {
  readonly userName: string | null;
}

export interface CashierScreen {
  /** Terminal de caixa deste aparelho; null = aparelho não é terminal de caixa. */
  readonly terminal: { readonly id: Id; readonly code: string; readonly name: string } | null;
  readonly session:
    | (CashSessionRecord & {
        readonly openedByName: string | null;
        readonly movements: CashMovementView[];
      })
    | null;
}

export async function current(
  deps: CashierDependencies,
  ctx: RequestContext,
): Promise<CashierScreen> {
  requirePermission(ctx, 'cashier.read');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const terminal = await cashTerminal(deps, tx, ctx);
    if (!terminal) return { terminal: null, session: null };
    const session = await deps.repo.findOpenSessionOfTerminal(tx, {
      storeId: ctx.storeId,
      terminalId: terminal.id,
    });
    if (!session) return { terminal, session: null };
    const movements = await deps.repo.listManualMovements(tx, session.id);
    const names = await deps.userNames(tx, [
      session.openedBy,
      ...movements.map((movement) => movement.userId),
    ]);
    return {
      terminal: { id: terminal.id, code: terminal.code, name: terminal.name },
      session: {
        ...session,
        openedByName: names.get(session.openedBy) ?? null,
        movements: movements.map((movement) => ({
          ...movement,
          userName: names.get(movement.userId) ?? null,
        })),
      },
    };
  });
}

export interface ClosedSummary extends CashSessionRecord {
  readonly openedByName: string | null;
  readonly closedByName: string | null;
  /** Só depois de fechado (fechamento cego); null enquanto aberto. */
  readonly counts: CountLine[] | null;
}

export async function summary(
  deps: CashierDependencies,
  ctx: RequestContext,
  sessionId: Id,
): Promise<ClosedSummary> {
  requirePermission(ctx, 'cashier.read');
  return runInTransaction(deps.db, async (tx) => {
    await activeStore(deps, tx, ctx);
    const session = await deps.repo.findSession(tx, { storeId: ctx.storeId, sessionId });
    if (!session) throw cashErrors.sessionNotFound();
    const counts =
      session.status === 'FECHADA'
        ? (await deps.repo.listCounts(tx, session.id)).sort(
            (a, b) => PAYMENT_METHODS.indexOf(a.method) - PAYMENT_METHODS.indexOf(b.method),
          )
        : null;
    const names = await deps.userNames(
      tx,
      [session.openedBy, session.closedBy].filter((id): id is Id => id !== null),
    );
    return {
      ...session,
      openedByName: names.get(session.openedBy) ?? null,
      closedByName: session.closedBy ? (names.get(session.closedBy) ?? null) : null,
      counts,
    };
  });
}

// ---- Abrir, movimentar, fechar ----

export async function open(
  deps: CashierDependencies,
  ctx: RequestContext,
  input: { openingCents: number | null; idempotencyKey: string },
): Promise<Jsonified<{ sessionId: Id }>> {
  requirePermission(ctx, 'cashier.open');
  const opening = openingAmount(input.openingCents);
  try {
    const outcome = await runInTransaction(deps.db, (tx) =>
      executeIdempotent(
        tx,
        {
          storeId: ctx.storeId,
          key: input.idempotencyKey,
          operation: 'cashier.open',
          payload: { opening },
        },
        async () => {
          await activeStore(deps, tx, ctx);
          const terminal = await requireCashTerminal(deps, tx, ctx);
          const existing = await deps.repo.findOpenSessionOfTerminal(
            tx,
            { storeId: ctx.storeId, terminalId: terminal.id },
            { forUpdate: true },
          );
          if (existing) throw cashErrors.alreadyOpen();
          const settings = await deps.stores.settings(tx, {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
          });
          if (!settings) throw cashErrors.storeNotFound();
          if (
            (await deps.repo.countOpenSessions(tx, ctx.storeId)) >= settings.maxOpenCashSessions
          ) {
            throw cashErrors.limitReached();
          }
          const now = ctx.clock.now();
          const sessionId = newId();
          await deps.repo.insertSession(tx, {
            id: sessionId,
            storeId: ctx.storeId,
            terminalId: terminal.id,
            operationalDate: operationalDate(now, settings.timezone, settings.operationalDayCutoff),
            openedBy: ctx.userId,
            openedAt: now,
            openingAmountCents: opening,
          });
          await recordAuditFromContext(tx, ctx, 'CASH_OPENED', {
            entityType: 'cash_session',
            entityId: sessionId,
            after: { terminal: terminal.code, openingCents: opening },
          });
          return { sessionId };
        },
      ),
    );
    return outcome.result;
  } catch (error) {
    // Duas aberturas simultâneas no mesmo terminal: o índice único decide
    if (mysqlErrno(error) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw cashErrors.alreadyOpen();
    throw error;
  }
}

export async function movement(
  deps: CashierDependencies,
  ctx: RequestContext,
  input: {
    type: 'SANGRIA' | 'SUPRIMENTO';
    amountCents: number | null;
    reason: string;
    idempotencyKey: string;
  },
): Promise<void> {
  requirePermission(ctx, 'cashier.movement');
  const amount = movementAmount(input.amountCents);
  const reason = cashReason(input.reason);
  await runInTransaction(deps.db, (tx) =>
    executeIdempotent(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'cashier.movement',
        payload: { type: input.type, amount, reason },
      },
      async () => {
        await activeStore(deps, tx, ctx);
        const session = await lockOpenSessionOfTerminal(deps, tx, ctx);
        if (input.type === 'SANGRIA') {
          const expected = await expectedOf(deps, tx, session);
          if (expected.DINHEIRO - amount < 0) throw cashErrors.insufficient();
        }
        const signed = input.type === 'SANGRIA' ? -amount : amount;
        await deps.repo.insertMovement(tx, {
          storeId: ctx.storeId,
          cashSessionId: session.id,
          type: input.type,
          paymentMethod: 'DINHEIRO',
          amountCents: signed,
          paymentId: null,
          reason,
          userId: ctx.userId,
          authorizedBy: null,
          occurredAt: ctx.clock.now(),
        });
        await recordAuditFromContext(tx, ctx, 'CASH_MOVEMENT', {
          entityType: 'cash_session',
          entityId: session.id,
          after: { type: input.type, amountCents: amount, reason },
        });
      },
    ),
  );
}

export async function close(
  deps: CashierDependencies,
  ctx: RequestContext,
  input: {
    sessionId: Id;
    version: number;
    declared: Partial<Record<PaymentMethod, number | null>>;
    idempotencyKey: string;
  },
): Promise<Jsonified<{ sessionId: Id; counts: CountLine[] }>> {
  requirePermission(ctx, 'cashier.close');
  const outcome = await runInTransaction(deps.db, (tx) =>
    executeIdempotent(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'cashier.close',
        payload: { sessionId: input.sessionId, version: input.version, declared: input.declared },
      },
      async () => {
        // A sessão travada é a primeira leitura: pagamentos confirmados antes entram no esperado
        const session = await deps.repo.findSession(
          tx,
          { storeId: ctx.storeId, sessionId: input.sessionId },
          { forUpdate: true },
        );
        if (!session) throw cashErrors.sessionNotFound();
        await activeStore(deps, tx, ctx);
        if (session.status === 'FECHADA') throw cashErrors.closed();
        if (session.version !== input.version) throw cashErrors.concurrent();
        const counts = blindCount(await expectedOf(deps, tx, session), input.declared);
        const closed = await deps.repo.closeSession(
          tx,
          { storeId: ctx.storeId, sessionId: session.id, version: session.version },
          { by: ctx.userId, at: ctx.clock.now() },
        );
        if (!closed) throw cashErrors.concurrent();
        await deps.repo.insertCounts(tx, session.id, counts);
        await recordAuditFromContext(tx, ctx, 'CASH_CLOSED', {
          entityType: 'cash_session',
          entityId: session.id,
          after: { counts: counts.map((line) => ({ ...line })) },
        });
        return { sessionId: session.id, counts };
      },
    ),
  );
  return outcome.result;
}

// ---- API para o PDV (na transação de quem chama — RN-CASH-04) ----

export function cashierPort(deps: CashierDependencies) {
  return {
    /** Caixa aberto deste terminal, travado (`CASH_NOT_OPEN` / `TERMINAL_REQUIRED`). */
    lockOpenSession: (tx: Transaction, ctx: RequestContext) =>
      lockOpenSessionOfTerminal(deps, tx, ctx),

    async recordSale(
      tx: Transaction,
      ctx: RequestContext,
      sale: { sessionId: Id; method: PaymentMethod; amountCents: number; paymentId: Id },
    ) {
      await deps.repo.insertMovement(tx, {
        storeId: ctx.storeId,
        cashSessionId: sale.sessionId,
        type: 'VENDA',
        paymentMethod: sale.method,
        amountCents: sale.amountCents,
        paymentId: sale.paymentId,
        reason: null,
        userId: ctx.userId,
        authorizedBy: null,
        occurredAt: ctx.clock.now(),
      });
    },

    /** Estorno no MESMO caixa do pagamento, que precisa estar aberto (RN-CASH-04). */
    async recordRefund(
      tx: Transaction,
      ctx: RequestContext,
      refund: {
        sessionId: Id;
        method: PaymentMethod;
        amountCents: number;
        paymentId: Id;
        reason: string;
        authorizedBy: Id | null;
      },
    ) {
      const session = await deps.repo.findSession(
        tx,
        { storeId: ctx.storeId, sessionId: refund.sessionId },
        { forUpdate: true },
      );
      if (session?.status !== 'ABERTA') throw cashErrors.closed();
      await deps.repo.insertMovement(tx, {
        storeId: ctx.storeId,
        cashSessionId: session.id,
        type: 'ESTORNO',
        paymentMethod: refund.method,
        amountCents: -refund.amountCents,
        paymentId: refund.paymentId,
        reason: refund.reason,
        userId: ctx.userId,
        authorizedBy: refund.authorizedBy,
        occurredAt: ctx.clock.now(),
      });
    },

    /** Esperado por forma (relatórios e testes). */
    async expected(tx: Transaction, ctx: RequestContext, sessionId: Id) {
      const session = await deps.repo.findSession(tx, { storeId: ctx.storeId, sessionId });
      if (!session) throw cashErrors.sessionNotFound();
      return expectedOf(deps, tx, session);
    },
  };
}

export type CashierPort = ReturnType<typeof cashierPort>;
