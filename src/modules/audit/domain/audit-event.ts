/** Eventos mínimos de auditoria (README B.7.8). */
export const AUDIT_EVENTS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DISABLED',
  'ROLE_CHANGED',
  // Etapa 3 — organização e contexto (docs/modules/organizations.md §6)
  'COMPANY_CREATED',
  'COMPANY_UPDATED',
  'STORE_CREATED',
  'STORE_UPDATED',
  'STORE_DISABLED',
  'STORE_ENABLED',
  'STORE_SWITCHED',
  'TERMINAL_CREATED',
  'TERMINAL_UPDATED',
  'TERMINAL_DISABLED',
  'TERMINAL_ENABLED',
  'TERMINAL_BOUND',
  'TERMINAL_UNBOUND',
  // Etapa 4 — catálogo (docs/modules/catalog.md §8)
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DISABLED',
  'PRODUCT_ENABLED',
  'PRODUCT_PRICE_SET',
  'PRODUCT_REMOVED_FROM_STORE',
  'PRODUCT_AVAILABILITY_CHANGED',
  'MODIFIER_GROUP_CREATED',
  'MODIFIER_GROUP_UPDATED',
  'MODIFIER_CREATED',
  'MODIFIER_UPDATED',
  'ORDER_OPENED',
  'ORDER_ITEM_ADDED',
  'ORDER_ITEM_CANCELLED',
  'ORDER_CLOSED',
  'ORDER_CANCELLED',
  'TABLE_TRANSFERRED',
  'DISCOUNT_APPLIED',
  'SERVICE_FEE_REMOVED',
  'ELEVATED_AUTH_GRANTED',
  'PAYMENT_CREATED',
  'PAYMENT_CANCELLED',
  'CASH_OPENED',
  'CASH_MOVEMENT',
  'CASH_CLOSED',
  // Etapa 5 — estoque e ficha técnica (docs/modules/inventory.md §8, recipes.md §5)
  'INGREDIENT_CREATED',
  'INGREDIENT_UPDATED',
  'STOCK_MINIMUM_SET',
  'STOCK_ENTRY',
  'STOCK_EXIT',
  'STOCK_ADJUSTMENT',
  'STOCK_LOSS',
  'RECIPE_UPDATED',
  // Etapa 6 — salão, mesas e pedidos (docs/modules/tables.md §8, orders.md §8)
  'TABLE_CREATED',
  'TABLE_UPDATED',
  'TABLE_STATUS_CHANGED',
  'TABLE_DETACHED',
  'ORDER_ROUND_SENT',
  'ORDERS_MERGED',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

// Rede de segurança (RN-AUDIT-05): mesmo que um caso de uso erre, estes campos nunca são gravados.
const SECRET_WORDS = new Set([
  'password',
  'pin',
  'hash',
  'token',
  'secret',
  'cookie',
  'authorization',
]);

/** Separa o nome do campo em palavras (camelCase, snake_case, kebab-case). */
function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((word) => word.toLowerCase());
}

/**
 * Campo é segredo se ALGUMA palavra do nome for sensível (pinCode, passwordNew, sessionCookie,
 * secretKey, grantTokenValue — sugestão 5 da reverificação). Por isso os eventos que descrevem
 * mudanças de senha/PIN usam o campo neutro `change` com o valor 'OWN_PIN', 'PASSWORD_RESET'...
 */
function isSecretKey(key: string): boolean {
  return words(key).some((word) => SECRET_WORDS.has(word));
}

export function stripSecrets(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !isSecretKey(key))
      .map(([key, value]) => [
        key,
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
          ? stripSecrets(value as Record<string, unknown>)
          : value,
      ]),
  );
}
