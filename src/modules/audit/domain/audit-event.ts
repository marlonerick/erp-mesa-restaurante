/** Eventos mínimos de auditoria (README B.7.8). */
export const AUDIT_EVENTS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DISABLED',
  'ROLE_CHANGED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
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
  'STOCK_ENTRY',
  'STOCK_EXIT',
  'STOCK_ADJUSTMENT',
  'STOCK_LOSS',
  'RECIPE_UPDATED',
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

// Rede de segurança (RN-AUDIT-05): mesmo que um caso de uso erre, estes campos nunca são gravados.
const SECRET_KEY = /pass(word)?|pin|hash|token|secret|cookie|authorization/i;

export function stripSecrets(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !SECRET_KEY.test(key))
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
