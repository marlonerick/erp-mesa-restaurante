// Porta web do módulo POS (adaptadores Next — ADR-0014).
export { pos } from './interface/service';
export {
  type BillItemView,
  type BillView,
  type PaymentView,
  type ReceivableView,
  toBillView,
  toReceivableView,
} from './interface/views';
