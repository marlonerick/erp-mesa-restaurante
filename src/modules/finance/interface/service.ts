import { type FinanceService, financeService } from '../index';

let service: FinanceService | undefined;

/** Casos de uso do financeiro com as dependências reais (banco do processo). */
export function finance(): FinanceService {
  service ??= financeService();
  return service;
}
