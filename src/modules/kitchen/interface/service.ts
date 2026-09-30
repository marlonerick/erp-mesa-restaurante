import { type KitchenService, kitchenService } from '../index';

let service: KitchenService | undefined;

/** Casos de uso da cozinha com as dependências reais (banco do processo). */
export function kitchen(): KitchenService {
  service ??= kitchenService();
  return service;
}
