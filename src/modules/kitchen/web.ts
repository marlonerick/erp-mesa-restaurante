// Porta web do módulo Kitchen (adaptadores Next — ADR-0014).
export { kitchen } from './interface/service';
export {
  type KitchenItemView,
  type KitchenTicketStatus,
  type KitchenTicketView,
  type KitchenView,
  toKitchenView,
} from './interface/views';
