import { type CashierService, cashierService } from '../index';

let service: CashierService | undefined;

/** Casos de uso do caixa com as dependências reais (banco do processo). */
export function cashier(): CashierService {
  service ??= cashierService();
  return service;
}
