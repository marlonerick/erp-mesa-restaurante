// Porta web do módulo Orders (adaptadores Next — ADR-0014).
export { orders } from './interface/service';
export {
  type FloorTableView,
  type FloorView,
  type ItemView,
  type MenuItemView,
  type OrderSummaryView,
  type OrderView,
  type RoundView,
  toFloorView,
  toMenuView,
  toOrderView,
} from './interface/views';
export { ITEM_NOTES_MAX_LENGTH, MAX_ITEM_QUANTITY } from './domain/rules';
