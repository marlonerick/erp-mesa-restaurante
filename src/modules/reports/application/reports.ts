import { costOfGoodsSold, lossesValue } from '@/modules/inventory';
import { getStore, getStoreSettings, type StoreSettings } from '@/modules/organizations';
import { sangriasAboveExpected } from '@/modules/cashier';
import { findUsersByIds } from '@/modules/users';
import { runInTransaction, type Transaction } from '@/shared/db/transaction';
import {
  addDays,
  DomainError,
  hasPermission,
  type Id,
  operationalDate,
  operationalDayStart,
  type Period,
  type RequestContext,
  requirePermission,
  validatePeriod,
} from '@/shared/kernel';
import {
  averageTicket,
  CSV_MAX_ROWS,
  margin,
  REPORT_PAGE_SIZE,
  TOP_PRODUCTS,
} from '../domain/rules';
import type { CategoryTotals, DayTotals, MethodTotals, ReportsDependencies } from './ports';

const storeNotFound = () => new DomainError('STORE_NOT_FOUND', 'Loja não encontrada.', 'NOT_FOUND');

interface StoreScope {
  readonly settings: StoreSettings;
  readonly today: string;
}

async function storeScope(tx: Transaction, ctx: RequestContext): Promise<StoreScope> {
  const store = await getStore(tx, ctx.storeId);
  if (store?.organizationId !== ctx.organizationId) throw storeNotFound();
  const settings = await getStoreSettings(tx, {
    organizationId: ctx.organizationId,
    storeId: ctx.storeId,
  });
  if (!settings) throw storeNotFound();
  return {
    settings,
    today: operationalDate(ctx.clock.now(), settings.timezone, settings.operationalDayCutoff),
  };
}

/** Período pedido ou, sem período, "hoje" (dia operacional — RN-REP-01). */
function periodOf(input: { from?: string | null; to?: string | null }, today: string): Period {
  return validatePeriod(input.from ?? today, input.to ?? input.from ?? today);
}

async function names(tx: Transaction, ids: readonly (Id | null)[]) {
  const unique = [...new Set(ids.filter((id): id is Id => id !== null))];
  return new Map((await findUsersByIds(tx, unique)).map((user) => [user.id, user.name]));
}

/** Página da tela (50 linhas) ou, sem página (CSV), as primeiras 10.000 (RN-REP-09). */
const pageOf = (page: number | null) =>
  page === null
    ? { offset: 0, limit: CSV_MAX_ROWS }
    : { offset: (page - 1) * REPORT_PAGE_SIZE, limit: REPORT_PAGE_SIZE };

interface PeriodInput {
  readonly from?: string | null;
  readonly to?: string | null;
}

// ---- Painel (RN-REP-03) ----

export interface Dashboard {
  readonly today: string;
  /**
   * Valores de venda: só para quem vê relatórios (gerente, admin). O CAIXA recebe null — E9-4 ("sem
   * valores financeiros detalhados"): com o total do dia ele estimaria o esperado da gaveta antes
   * do fechamento cego (achado B-1 da revisão, RN-CASH-06).
   */
  readonly salesCents: number | null;
  readonly closedOrders: number;
  readonly averageTicketCents: number | null;
  readonly openOrders: number;
  readonly occupiedTables: number;
  readonly kitchenItems: number;
  readonly lateItems: number;
  readonly lateMinutes: number;
  /** Caixas abertos — SEM esperado (fechamento cego, RN-CASH-06). */
  readonly openCash: {
    readonly terminalCode: string;
    readonly terminalName: string;
    readonly openedByName: string | null;
    readonly openedAt: Date;
  }[];
  readonly topProducts: { readonly name: string; readonly quantity: number }[];
  readonly lowStock: {
    readonly name: string;
    readonly unit: string;
    readonly quantity: string;
    readonly minQuantity: string;
  }[];
}

export async function dashboard(
  deps: ReportsDependencies,
  ctx: RequestContext,
): Promise<Dashboard> {
  requirePermission(ctx, 'dashboard.read');
  return runInTransaction(deps.db, async (tx) => {
    const { settings, today } = await storeScope(tx, ctx);
    const [day] = await deps.repo.closedOrdersByDay(tx, ctx.storeId, today, today);
    const lateBefore = new Date(ctx.clock.now().getTime() - settings.kdsLateMinutes * 60_000);
    const kitchen = await deps.repo.kitchenItems(tx, ctx.storeId, lateBefore);
    const cash = await deps.repo.openCashSessions(tx, ctx.storeId);
    const people = await names(
      tx,
      cash.map((item) => item.openedBy),
    );
    const salesCents = day?.totalCents ?? 0;
    const closedOrders = day?.orders ?? 0;
    const values = hasPermission(ctx, 'reports.read');
    return {
      today,
      salesCents: values ? salesCents : null,
      closedOrders,
      averageTicketCents: values ? averageTicket(salesCents, closedOrders) : null,
      openOrders: await deps.repo.openOrders(tx, ctx.storeId),
      occupiedTables: await deps.repo.occupiedTables(tx, ctx.storeId),
      kitchenItems: kitchen.items,
      lateItems: kitchen.late,
      lateMinutes: settings.kdsLateMinutes,
      openCash: cash.map((item) => ({
        terminalCode: item.terminalCode,
        terminalName: item.terminalName,
        openedByName: people.get(item.openedBy) ?? null,
        openedAt: item.openedAt,
      })),
      // Mais vendidos por QUANTIDADE, numa consulta leve (sem custo — achado I-3)
      topProducts: await deps.repo.topProducts(tx, ctx.storeId, today, TOP_PRODUCTS),
      lowStock: (await deps.repo.lowStock(tx, ctx.storeId)).map((row) => ({
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        minQuantity: row.minQuantity,
      })),
    };
  });
}

// ---- Vendas (RN-REP-02, RN-REP-04) ----

export interface SalesReport extends Period {
  readonly days: (DayTotals & { readonly averageTicketCents: number })[];
  readonly totals: {
    readonly orders: number;
    readonly itemsCents: number;
    readonly discountsCents: number;
    readonly serviceFeeCents: number;
    readonly totalCents: number;
    readonly averageTicketCents: number;
  };
  readonly categories: CategoryTotals[];
  readonly methods: MethodTotals[];
}

export async function sales(
  deps: ReportsDependencies,
  ctx: RequestContext,
  input: PeriodInput,
): Promise<SalesReport> {
  requirePermission(ctx, 'reports.read');
  return runInTransaction(deps.db, async (tx) => {
    const { today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    const days = await deps.repo.closedOrdersByDay(tx, ctx.storeId, period.from, period.to);
    const sum = (
      key: 'orders' | 'itemsCents' | 'discountsCents' | 'serviceFeeCents' | 'totalCents',
    ) => days.reduce((total, day) => total + day[key], 0);
    const totals = {
      orders: sum('orders'),
      itemsCents: sum('itemsCents'),
      discountsCents: sum('discountsCents'),
      serviceFeeCents: sum('serviceFeeCents'),
      totalCents: sum('totalCents'),
    };
    return {
      ...period,
      days: days.map((day) => ({
        ...day,
        averageTicketCents: averageTicket(day.totalCents, day.orders),
      })),
      totals: { ...totals, averageTicketCents: averageTicket(totals.totalCents, totals.orders) },
      categories: await deps.repo.salesByCategory(tx, ctx.storeId, period.from, period.to),
      methods: await deps.repo.paymentsByMethod(tx, ctx.storeId, period.from, period.to),
    };
  });
}

export interface ProductSalesRow {
  readonly productId: Id;
  readonly name: string;
  readonly quantity: number;
  readonly grossCents: number;
  readonly discountsCents: number;
  readonly costCents: number;
  readonly marginCents: number;
}

export interface ProductSales extends Period {
  readonly rows: ProductSalesRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Vendas por produto com custo e margem (E9-7); `page` null = CSV (até 10.000 linhas). */
export async function salesByProduct(
  deps: ReportsDependencies,
  ctx: RequestContext,
  input: PeriodInput & { page?: number | null },
): Promise<ProductSales> {
  requirePermission(ctx, 'reports.read');
  const page = input.page === null ? null : Math.max(1, Math.floor(input.page ?? 1));
  return runInTransaction(deps.db, async (tx) => {
    const { today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    const { rows, total } = await deps.repo.salesByProduct(
      tx,
      ctx.storeId,
      period.from,
      period.to,
      pageOf(page),
    );
    return {
      ...period,
      total,
      page: page ?? 1,
      pageSize: REPORT_PAGE_SIZE,
      rows: rows.map((row) => ({
        ...row,
        marginCents: margin(row.grossCents, row.discountsCents, row.costCents),
      })),
    };
  });
}

// ---- Caixa (RN-REP-05) ----

export interface CashReportSession {
  readonly id: Id;
  readonly status: 'ABERTA' | 'FECHADA';
  readonly operationalDate: string;
  readonly terminalCode: string;
  readonly terminalName: string;
  readonly openedByName: string | null;
  readonly closedByName: string | null;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly openingCents: number;
  /** 1ª contagem do dinheiro (recontagem — E10-6); só de caixas fechados. */
  readonly firstCashCountCents: number | null;
  readonly withdrawalsCents: number;
  readonly suppliesCents: number;
  /** Só caixas FECHADOS (o esperado do aberto não aparece — RN-CASH-06). */
  readonly counts:
    | {
        readonly method: string;
        readonly expectedCents: number;
        readonly declaredCents: number | null;
        readonly differenceCents: number | null;
      }[]
    | null;
  readonly alerts: number;
}

export async function cash(
  deps: ReportsDependencies,
  ctx: RequestContext,
  input: PeriodInput,
): Promise<Period & { sessions: CashReportSession[] }> {
  requirePermission(ctx, 'reports.read');
  return runInTransaction(deps.db, async (tx) => {
    const { today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    const sessions = await deps.repo.cashSessions(tx, ctx.storeId, period.from, period.to);
    const ids = sessions.map((session) => session.id);
    const closedIds = sessions
      .filter((session) => session.status === 'FECHADA')
      .map((session) => session.id);
    // Somas no banco; movimentações (em dinheiro) só dos caixas fechados, para os alertas (S-7)
    const totals = await deps.repo.cashMovementTotals(tx, ctx.storeId, ids);
    const movements = await deps.repo.cashMovements(tx, ctx.storeId, closedIds);
    const counts = await deps.repo.cashCounts(tx, ctx.storeId, closedIds);
    const people = await names(
      tx,
      sessions.flatMap((session) => [session.openedBy, session.closedBy]),
    );
    return {
      ...period,
      sessions: sessions.map((session) => {
        const own = movements.filter((movement) => movement.sessionId === session.id);
        const total = (type: string) =>
          totals.find((line) => line.sessionId === session.id && line.type === type)?.amountCents ??
          0;
        const closed = session.status === 'FECHADA';
        return {
          id: session.id,
          status: session.status,
          operationalDate: session.operationalDate,
          terminalCode: session.terminalCode,
          terminalName: session.terminalName,
          openedByName: people.get(session.openedBy) ?? null,
          closedByName: session.closedBy ? (people.get(session.closedBy) ?? null) : null,
          openedAt: session.openedAt,
          closedAt: session.closedAt,
          openingCents: session.openingCents,
          firstCashCountCents: closed ? session.firstCashCountCents : null,
          withdrawalsCents: total('SANGRIA'),
          suppliesCents: total('SUPRIMENTO'),
          counts: closed
            ? counts
                .filter((line) => line.sessionId === session.id)
                .map((line) => ({
                  method: line.method,
                  expectedCents: line.expectedCents,
                  declaredCents: line.declaredCents,
                  differenceCents: line.differenceCents,
                }))
            : null,
          alerts: closed ? sangriasAboveExpected(session.openingCents, own).length : 0,
        };
      }),
    };
  });
}

// ---- Estoque (RN-REP-06) ----

export async function stock(deps: ReportsDependencies, ctx: RequestContext, input: PeriodInput) {
  requirePermission(ctx, 'reports.read');
  return runInTransaction(deps.db, async (tx) => {
    const { today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    const balances = await deps.repo.stockBalances(tx, ctx.storeId);
    return {
      ...period,
      balances: balances.map((row) => ({
        ...row,
        belowMinimum:
          Number(row.minQuantity) > 0 && Number(row.quantity) <= Number(row.minQuantity),
      })),
      movements: await deps.repo.stockMovementsByType(tx, ctx.storeId, period.from, period.to),
      cogsCents: await costOfGoodsSold(tx, { storeId: ctx.storeId, ...period }),
      lossesCents: await lossesValue(tx, { storeId: ctx.storeId, ...period }),
    };
  });
}

export type StockReport = Awaited<ReturnType<typeof stock>>;

// ---- Operação (RN-REP-07) ----

export async function operations(
  deps: ReportsDependencies,
  ctx: RequestContext,
  input: PeriodInput,
) {
  requirePermission(ctx, 'reports.read');
  return runInTransaction(deps.db, async (tx) => {
    const { today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    const opened = await deps.repo.ordersOpened(tx, ctx.storeId, period.from, period.to);
    const days = await deps.repo.closedOrdersByDay(tx, ctx.storeId, period.from, period.to);
    const count = (filter: (row: (typeof opened)[number]) => boolean) =>
      opened.filter(filter).reduce((sum, row) => sum + row.orders, 0);
    const tables = opened.filter((row) => row.type === 'MESA');
    const guests = tables.reduce((sum, row) => sum + row.guests, 0);
    const withGuests = tables.reduce((sum, row) => sum + row.withGuests, 0);
    const closedOrders = days.reduce((sum, day) => sum + day.orders, 0);
    const closedTotal = days.reduce((sum, day) => sum + day.totalCents, 0);
    return {
      ...period,
      openedOrders: count(() => true),
      tableOrders: count((row) => row.type === 'MESA'),
      counterOrders: count((row) => row.type === 'BALCAO'),
      stillOpen: count((row) => row.status === 'ABERTO'),
      cancelledOrders: opened
        .filter((row) => row.status === 'CANCELADO')
        .reduce((sum, row) => sum + row.orders - row.merged, 0),
      mergedOrders: opened.reduce((sum, row) => sum + row.merged, 0),
      closedOrders,
      averageTicketCents: averageTicket(closedTotal, closedOrders),
      /** Pessoas por mesa (só as contas que informaram), em décimos: 25 = 2,5. */
      guestsPerTableTenths: withGuests === 0 ? 0 : Math.round((guests * 10) / withGuests),
      discountsCents: days.reduce((sum, day) => sum + day.discountsCents, 0),
      serviceFeeWaived: opened.reduce((sum, row) => sum + row.serviceFeeWaived, 0),
      cancelledItems: await deps.repo.cancelledItems(tx, ctx.storeId, period.from, period.to),
    };
  });
}

export type OperationsReport = Awaited<ReturnType<typeof operations>>;

// ---- Auditoria (RN-REP-08) ----

export async function audit(
  deps: ReportsDependencies,
  ctx: RequestContext,
  input: PeriodInput & { event?: string | null; userId?: Id | null; page?: number | null },
) {
  requirePermission(ctx, 'audit.read');
  const page = input.page === null ? null : Math.max(1, Math.floor(input.page ?? 1));
  return runInTransaction(deps.db, async (tx) => {
    const { settings, today } = await storeScope(tx, ctx);
    const period = periodOf(input, today);
    // Dias operacionais → instantes (a auditoria guarda a hora UTC)
    const start = operationalDayStart(
      period.from,
      settings.timezone,
      settings.operationalDayCutoff,
    );
    const end = operationalDayStart(
      addDays(period.to, 1),
      settings.timezone,
      settings.operationalDayCutoff,
    );
    const { rows, total } = await deps.repo.audit(
      tx,
      {
        storeId: ctx.storeId,
        start,
        end,
        event: input.event ?? null,
        userId: input.userId ?? null,
      },
      pageOf(page),
    );
    const authorizers = await names(
      tx,
      rows.map((row) => row.authorizerUserId),
    );
    return {
      ...period,
      total,
      page: page ?? 1,
      pageSize: REPORT_PAGE_SIZE,
      rows: rows.map((row) => ({
        ...row,
        authorizerName: row.authorizerUserId
          ? (authorizers.get(row.authorizerUserId) ?? null)
          : null,
      })),
    };
  });
}

export type AuditReport = Awaited<ReturnType<typeof audit>>;
