import { type InventoryService, inventoryService } from '../index';

let service: InventoryService | undefined;

/** Casos de uso do estoque com as dependências reais (banco do processo). */
export function inventory(): InventoryService {
  service ??= inventoryService();
  return service;
}
