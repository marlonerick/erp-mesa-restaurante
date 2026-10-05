import { type ReportsService, reportsService } from '../index';

let service: ReportsService | undefined;

/** Painel e relatórios com as dependências reais (banco do processo). */
export function reports(): ReportsService {
  service ??= reportsService();
  return service;
}
