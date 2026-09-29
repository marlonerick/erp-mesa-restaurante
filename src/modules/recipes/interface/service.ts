import { type RecipesService, recipesService } from '../index';

let service: RecipesService | undefined;

/** Casos de uso da ficha técnica com as dependências reais (banco do processo). */
export function recipes(): RecipesService {
  service ??= recipesService();
  return service;
}
