// API pública do módulo Reports (Etapa 9 — docs/modules/reports.md). Somente leitura.
import { type Database, getDatabase } from '@/shared/db/client';
import type { RequestContext } from '@/shared/kernel';
import type { ReportsDependencies } from './application/ports';
import * as useCases from './application/reports';
import { reportsRepository as repo } from './infrastructure/reports-repository';

export type {
  AuditReport,
  CashReportSession,
  Dashboard,
  OperationsReport,
  ProductSales,
  ProductSalesRow,
  SalesReport,
  StockReport,
} from './application/reports';
export { averageTicket, CSV_MAX_ROWS, csvMoney, toCsv } from './domain/rules';

export function reportsService(overrides: { db?: Database } = {}) {
  const { db } = overrides;
  const deps: ReportsDependencies = {
    get db() {
      return db ?? getDatabase().db;
    },
    repo,
  };
  type Input<F> = F extends (d: ReportsDependencies, c: RequestContext, i: infer I) => unknown
    ? I
    : never;
  return {
    dashboard: (ctx: RequestContext) => useCases.dashboard(deps, ctx),
    sales: (ctx: RequestContext, input: Input<typeof useCases.sales>) =>
      useCases.sales(deps, ctx, input),
    salesByProduct: (ctx: RequestContext, input: Input<typeof useCases.salesByProduct>) =>
      useCases.salesByProduct(deps, ctx, input),
    cash: (ctx: RequestContext, input: Input<typeof useCases.cash>) =>
      useCases.cash(deps, ctx, input),
    stock: (ctx: RequestContext, input: Input<typeof useCases.stock>) =>
      useCases.stock(deps, ctx, input),
    operations: (ctx: RequestContext, input: Input<typeof useCases.operations>) =>
      useCases.operations(deps, ctx, input),
    audit: (ctx: RequestContext, input: Input<typeof useCases.audit>) =>
      useCases.audit(deps, ctx, input),
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
