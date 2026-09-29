import { type CatalogService, catalogService } from '../index';

let service: CatalogService | undefined;

/** Casos de uso do cardápio com as dependências reais (banco do processo). */
export function catalog(): CatalogService {
  service ??= catalogService();
  return service;
}
