import { recordAuditFromContext } from '@/modules/audit';
import { MYSQL_ERRNO, mysqlErrno } from '@/shared/db/mysql-errors';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import { executeIdempotent, type Jsonified } from '@/shared/idempotency/idempotency';
import {
  addDays,
  DomainError,
  type Id,
  newId,
  type RequestContext,
  requirePermission,
  validatePeriod,
} from '@/shared/kernel';
import {
  cancelReason,
  type CashFlowDay,
  cashFlowDays,
  categoryName,
  DEFAULT_CATEGORIES,
  ENTRIES_PAGE_SIZE,
  financeAmount,
  financeDate,
  financeDescription,
  type FinanceStatus,
  type FinanceType,
  SALES_CATEGORY_CODE,
  UPCOMING_DAYS,
} from '../domain/rules';
import type { CategoryRecord, EntryRecord, FinanceDependencies, PaymentMethodCode } from './ports';

const rule = (code: string, message: string) => new DomainError(code, message, 'BUSINESS_RULE');

export const financeErrors = {
  storeNotFound: () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND'),
  entryNotFound: () =>
    new DomainError('FINANCE_ENTRY_NOT_FOUND', 'Lançamento não encontrado.', 'NOT_FOUND'),
  categoryInvalid: () =>
    rule('FINANCE_CATEGORY_INVALID', 'Escolha uma categoria ativa do mesmo tipo.'),
  categoryNotFound: () =>
    new DomainError('FINANCE_CATEGORY_NOT_FOUND', 'Categoria não encontrada.', 'NOT_FOUND'),
  categoryTaken: () =>
    new DomainError('FINANCE_CATEGORY_TAKEN', 'Já existe uma categoria com este nome.', 'CONFLICT'),
  systemCategory: () => rule('FINANCE_CATEGORY_SYSTEM', 'A categoria Vendas é do sistema.'),
  automatic: () =>
    rule('FINANCE_ENTRY_AUTOMATIC', 'Lançamento do fechamento do caixa não é alterado.'),
  cancelled: () => rule('FINANCE_ENTRY_CANCELLED', 'Este lançamento já foi cancelado.'),
  futurePayment: () =>
    new DomainError(
      'INVALID_FINANCE_DATE',
      'A data do pagamento não pode ser depois de hoje.',
      'VALIDATION',
    ),
  concurrent: () =>
    new DomainError(
      'CONCURRENT_MODIFICATION',
      'Outra pessoa alterou este lançamento. Recarregue a página.',
      'CONFLICT',
    ),
};

/** Loja ativa → empresa; categorias iniciais garantidas (RN-FIN-01, RN-FIN-02). */
async function scope(deps: FinanceDependencies, tx: Transaction, ctx: RequestContext) {
  const store = await deps.findStore(tx, ctx.storeId);
  if (store?.organizationId !== ctx.organizationId) throw financeErrors.storeNotFound();
  // Grava só se faltar alguma (achado S-4: antes 9 gravações em cada leitura travavam as categorias)
  const existing = await deps.repo.listCategories(tx, store.companyId);
  const missing = DEFAULT_CATEGORIES.filter(
    (wanted) =>
      !existing.some((category) =>
        wanted.systemCode
          ? category.systemCode === wanted.systemCode
          : category.type === wanted.type &&
            category.name.toLowerCase() === wanted.name.toLowerCase(),
      ),
  );
  // Categoria não é apagada (só desativada): faltar alguma = primeira vez da empresa
  if (missing.length > 0) {
    await deps.repo.ensureCategories(tx, store.companyId, DEFAULT_CATEGORIES);
  }
  return { companyId: store.companyId };
}

const today = (deps: FinanceDependencies, tx: Transaction, ctx: RequestContext) =>
  deps.today(tx, { organizationId: ctx.organizationId, storeId: ctx.storeId }, ctx.clock.now());

// ---- Categorias ----

export async function categories(
  deps: FinanceDependencies,
  ctx: RequestContext,
): Promise<CategoryRecord[]> {
  requirePermission(ctx, 'finance.read');
  return runInTransaction(deps.db, async (tx) => {
    const { companyId } = await scope(deps, tx, ctx);
    return deps.repo.listCategories(tx, companyId);
  });
}

export async function createCategory(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: { type: FinanceType; name: string },
): Promise<{ id: Id }> {
  requirePermission(ctx, 'finance.manage');
  const name = categoryName(input.name);
  try {
    return await runInTransaction(deps.db, async (tx) => {
      const { companyId } = await scope(deps, tx, ctx);
      const id = newId();
      await deps.repo.insertCategory(tx, { id, companyId, type: input.type, name });
      await recordAuditFromContext(tx, ctx, 'FINANCE_CATEGORY_CREATED', {
        entityType: 'finance_category',
        entityId: id,
        after: { type: input.type, name },
      });
      return { id };
    });
  } catch (error) {
    // Nome único por empresa e tipo, sem diferenciar maiúsculas (collation do banco)
    if (mysqlErrno(error) === MYSQL_ERRNO.DUPLICATE_ENTRY) throw financeErrors.categoryTaken();
    throw error;
  }
}

export async function setCategoryActive(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: { categoryId: Id; version: number; active: boolean },
): Promise<void> {
  requirePermission(ctx, 'finance.manage');
  await runInTransaction(deps.db, async (tx) => {
    const { companyId } = await scope(deps, tx, ctx);
    const category = await deps.repo.findCategory(tx, { companyId, categoryId: input.categoryId });
    if (!category) throw financeErrors.categoryNotFound();
    if (category.systemCode) throw financeErrors.systemCategory();
    if (category.active === input.active) return;
    const changed = await deps.repo.setCategoryActive(
      tx,
      { companyId, categoryId: category.id, version: input.version },
      input.active,
    );
    if (!changed) throw financeErrors.concurrent();
    await recordAuditFromContext(tx, ctx, 'FINANCE_CATEGORY_UPDATED', {
      entityType: 'finance_category',
      entityId: category.id,
      before: { active: category.active },
      after: { name: category.name, active: input.active },
    });
  });
}

// ---- Lançamentos (RN-FIN-04 a RN-FIN-06, RN-FIN-08) ----

export interface EntriesPage {
  readonly rows: (EntryRecord & { readonly createdByName: string | null })[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function entries(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: {
    from: string;
    to: string;
    type?: FinanceType | null;
    status?: FinanceStatus | null;
    categoryId?: Id | null;
    page?: number;
  },
): Promise<EntriesPage> {
  requirePermission(ctx, 'finance.read');
  const period = validatePeriod(input.from, input.to);
  const page = Math.max(1, Math.floor(input.page ?? 1));
  return runInTransaction(deps.db, async (tx) => {
    await scope(deps, tx, ctx);
    const { rows, total } = await deps.repo.listEntries(
      tx,
      {
        storeId: ctx.storeId,
        ...period,
        type: input.type ?? null,
        status: input.status ?? null,
        categoryId: input.categoryId ?? null,
      },
      { offset: (page - 1) * ENTRIES_PAGE_SIZE, limit: ENTRIES_PAGE_SIZE },
    );
    const names = await deps.userNames(tx, [...new Set(rows.map((row) => row.createdBy))]);
    return {
      rows: rows.map((row) => ({ ...row, createdByName: names.get(row.createdBy) ?? null })),
      total,
      page,
      pageSize: ENTRIES_PAGE_SIZE,
    };
  });
}

export interface NewEntryInput {
  readonly type: FinanceType;
  readonly categoryId: Id;
  readonly description: string;
  readonly amountCents: number | null;
  readonly competenceDate: string;
  /** PAGO: dia do pagamento; PREVISTO: vencimento. */
  readonly status: 'PAGO' | 'PREVISTO';
  readonly date: string;
  readonly idempotencyKey: string;
}

export async function createEntry(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: NewEntryInput,
): Promise<Jsonified<{ id: Id }>> {
  requirePermission(ctx, 'finance.manage');
  const description = financeDescription(input.description);
  const amountCents = financeAmount(input.amountCents);
  const outcome = await runInTransaction(deps.db, (tx) =>
    executeIdempotent(
      tx,
      {
        storeId: ctx.storeId,
        key: input.idempotencyKey,
        operation: 'finance.createEntry',
        payload: { ...input, description, amountCents },
      },
      async () => {
        const { companyId } = await scope(deps, tx, ctx);
        const day = await today(deps, tx, ctx);
        const competenceDate = financeDate(input.competenceDate, day);
        // Já pago: o pagamento não pode estar no futuro; previsto: vencimento até um ano à frente
        const date =
          input.status === 'PAGO' ? paidDateOf(input.date, day) : financeDate(input.date, day);
        const category = await deps.repo.findCategory(tx, {
          companyId,
          categoryId: input.categoryId,
        });
        // Vendas só entram pelo fechamento do caixa (RN-FIN-02)
        if (!category?.active || category.type !== input.type || category.systemCode) {
          throw financeErrors.categoryInvalid();
        }
        const id = newId();
        await deps.repo.insertEntry(tx, {
          id,
          storeId: ctx.storeId,
          type: input.type,
          categoryId: category.id,
          description,
          amountCents,
          competenceDate,
          dueDate: input.status === 'PREVISTO' ? date : null,
          paidDate: input.status === 'PAGO' ? date : null,
          status: input.status,
          source: 'MANUAL',
          cashSessionId: null,
          paymentMethod: null,
          createdBy: ctx.userId,
          createdAt: ctx.clock.now(),
        });
        await recordAuditFromContext(tx, ctx, 'FINANCE_ENTRY_CREATED', {
          entityType: 'finance_entry',
          entityId: id,
          after: {
            type: input.type,
            category: category.name,
            description,
            amountCents,
            status: input.status,
            date,
          },
        });
        return { id };
      },
    ),
  );
  return outcome.result;
}

async function lockManualEntry(
  deps: FinanceDependencies,
  tx: Transaction,
  ctx: RequestContext,
  input: { entryId: Id; version: number },
  options: { alreadyPaidIsDone?: boolean } = {},
) {
  const entry = await deps.repo.findEntry(
    tx,
    { storeId: ctx.storeId, entryId: input.entryId },
    { forUpdate: true },
  );
  if (!entry) throw financeErrors.entryNotFound();
  if (entry.source === 'CAIXA') throw financeErrors.automatic();
  if (entry.status === 'CANCELADO') throw financeErrors.cancelled();
  // Reenvio do "pagar" (internet caiu) em lançamento já pago: nada muda, sem erro (S-1)
  if (options.alreadyPaidIsDone && entry.status === 'PAGO') return entry;
  if (entry.version !== input.version) throw financeErrors.concurrent();
  return entry;
}

/** Dia do pagamento: data válida e não depois de hoje (dia operacional) — S-1 da revisão. */
function paidDateOf(text: string, today: string): string {
  const date = financeDate(text, today);
  if (date > today) throw financeErrors.futurePayment();
  return date;
}

export async function payEntry(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: { entryId: Id; version: number; paidDate: string },
): Promise<void> {
  requirePermission(ctx, 'finance.manage');
  await runInTransaction(deps.db, async (tx) => {
    await scope(deps, tx, ctx);
    const paidDate = paidDateOf(input.paidDate, await today(deps, tx, ctx));
    const entry = await lockManualEntry(deps, tx, ctx, input, { alreadyPaidIsDone: true });
    if (entry.status === 'PAGO') return;
    await deps.repo.markPaid(tx, { storeId: ctx.storeId, entryId: entry.id }, paidDate);
    await recordAuditFromContext(tx, ctx, 'FINANCE_ENTRY_PAID', {
      entityType: 'finance_entry',
      entityId: entry.id,
      before: { status: entry.status, dueDate: entry.dueDate },
      after: { status: 'PAGO', paidDate, amountCents: entry.amountCents },
    });
  });
}

export async function cancelEntry(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: { entryId: Id; version: number; reason: string },
): Promise<void> {
  requirePermission(ctx, 'finance.manage');
  const reason = cancelReason(input.reason);
  await runInTransaction(deps.db, async (tx) => {
    await scope(deps, tx, ctx);
    const entry = await lockManualEntry(deps, tx, ctx, input);
    await deps.repo.markCancelled(
      tx,
      { storeId: ctx.storeId, entryId: entry.id },
      { by: ctx.userId, at: ctx.clock.now(), reason },
    );
    await recordAuditFromContext(tx, ctx, 'FINANCE_ENTRY_CANCELLED', {
      entityType: 'finance_entry',
      entityId: entry.id,
      before: { status: entry.status, amountCents: entry.amountCents },
      after: { status: 'CANCELADO', reason },
    });
  });
}

// ---- Fluxo de caixa (RN-FIN-07) ----

export interface CashFlow {
  readonly from: string;
  readonly to: string;
  readonly today: string;
  readonly days: CashFlowDay[];
  readonly inflowCents: number;
  readonly outflowCents: number;
  /** PREVISTOS com vencimento até hoje + 30 dias (os vencidos aparecem primeiro). */
  readonly upcoming: EntryRecord[];
}

export async function cashFlow(
  deps: FinanceDependencies,
  ctx: RequestContext,
  input: { from: string; to: string },
): Promise<CashFlow> {
  requirePermission(ctx, 'finance.read');
  const period = validatePeriod(input.from, input.to);
  return runInTransaction(deps.db, async (tx) => {
    await scope(deps, tx, ctx);
    const day = await today(deps, tx, ctx);
    const days = cashFlowDays(await deps.repo.paidTotals(tx, { storeId: ctx.storeId, ...period }));
    return {
      ...period,
      today: day,
      days,
      inflowCents: days.reduce((sum, item) => sum + item.inflowCents, 0),
      outflowCents: days.reduce((sum, item) => sum + item.outflowCents, 0),
      upcoming: await deps.repo.upcoming(tx, {
        storeId: ctx.storeId,
        until: addDays(day, UPCOMING_DAYS),
      }),
    };
  });
}

// ---- API para o caixa (RN-FIN-03), na transação do fechamento ----

export function financePort(deps: FinanceDependencies) {
  return {
    /** Uma receita de vendas por forma de pagamento com total líquido positivo. */
    async recordCashSales(
      tx: Transaction,
      ctx: RequestContext,
      input: {
        sessionId: Id;
        operationalDate: string;
        totals: readonly { method: PaymentMethodCode; amountCents: number }[];
      },
    ) {
      const { companyId } = await scope(deps, tx, ctx);
      const sales = await deps.repo.findSystemCategory(tx, companyId, SALES_CATEGORY_CODE);
      if (!sales) throw financeErrors.categoryNotFound();
      for (const total of input.totals) {
        if (total.amountCents <= 0) continue;
        await deps.repo.insertEntry(tx, {
          id: newId(),
          storeId: ctx.storeId,
          type: 'RECEITA',
          categoryId: sales.id,
          description: `Vendas do caixa de ${input.operationalDate.split('-').reverse().join('/')}`,
          amountCents: total.amountCents,
          competenceDate: input.operationalDate,
          dueDate: null,
          paidDate: input.operationalDate,
          status: 'PAGO',
          source: 'CAIXA',
          cashSessionId: input.sessionId,
          paymentMethod: total.method,
          createdBy: ctx.userId,
          createdAt: ctx.clock.now(),
        });
      }
    },
  };
}

export type FinancePort = ReturnType<typeof financePort>;
