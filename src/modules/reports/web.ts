// Porta web do módulo Reports (adaptadores Next — ADR-0014).
export { reports } from './interface/service';
export { type DashboardView, toDashboardView } from './interface/views';
export { CSV_MAX_ROWS, csvMoney, toCsv } from './domain/rules';
