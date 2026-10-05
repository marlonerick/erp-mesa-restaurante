// Porta web do módulo Finance (adaptadores Next — ADR-0014).
export { finance } from './interface/service';
export {
  type CashFlowView,
  type CategoryView,
  type EntriesView,
  type EntryView,
  toCashFlowView,
  toCategoryView,
  toEntriesView,
} from './interface/views';
export { FINANCE_TYPE_LABEL, FINANCE_TYPES, type FinanceType } from './domain/rules';
