import { type PosService, posService } from '../index';

let service: PosService | undefined;

/** Casos de uso do PDV com as dependências reais (banco do processo). */
export function pos(): PosService {
  service ??= posService();
  return service;
}
