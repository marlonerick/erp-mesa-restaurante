/**
 * Catálogo de permissões do MVP (README B.7.1). Deve ser IGUAL à tabela `permission`
 * (migration 0002) — um teste de integração garante isso.
 */
export const PERMISSIONS = [
  'dashboard.read',
  'users.read',
  'users.create',
  'users.update',
  'users.disable',
  'stores.read',
  'stores.manage',
  'products.read',
  'products.create',
  'products.update',
  'tables.read',
  'tables.manage',
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.cancel',
  'kds.read',
  'kds.manage',
  'cashier.read',
  'cashier.open',
  'cashier.close',
  'cashier.movement',
  'payments.create',
  'payments.cancel',
  'discounts.apply',
  'discounts.apply_above_limit',
  'inventory.read',
  'inventory.manage',
  'recipes.read',
  'recipes.manage',
  'finance.read',
  'finance.manage',
  'reports.read',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Perfis de sistema (RN-AUTHZ-04). */
export const SYSTEM_ROLES = ['ADMIN', 'GERENTE', 'CAIXA', 'GARCOM', 'COZINHA'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
