// Porta web do módulo Cashier (adaptadores Next — ADR-0014).
export { cashier } from './interface/service';
export {
  type CashierView,
  type CashMovementView,
  type CashSummaryView,
  type CountView,
  toCashierView,
  toCashSummaryView,
} from './interface/views';
export { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from './domain/rules';
