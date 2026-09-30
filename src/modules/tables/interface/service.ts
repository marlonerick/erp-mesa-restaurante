import { type TablesService, tablesService } from '../index';

let service: TablesService | undefined;

/** Casos de uso das mesas com as dependências reais (banco do processo). */
export function tables(): TablesService {
  service ??= tablesService();
  return service;
}
