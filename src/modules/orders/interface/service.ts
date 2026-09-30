import { type OrdersService, ordersService } from '../index';

let service: OrdersService | undefined;

/** Casos de uso da comanda com as dependências reais (banco do processo). */
export function orders(): OrdersService {
  service ??= ordersService();
  return service;
}
