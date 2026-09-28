import { createHash } from 'node:crypto';

/**
 * Forma canônica do payload: chaves ordenadas ({a,b} e {b,a} são iguais), datas e bigint com
 * marcação própria (não viram {} nem quebram o JSON), tipos de valor pelo próprio toJSON.
 * Tipos sem representação clara (Map, Set, função, instâncias sem toJSON) são RECUSADOS —
 * ignorá-los faria requisições diferentes parecerem iguais.
 */
function canonicalize(value: unknown): unknown {
  switch (typeof value) {
    case 'string':
    case 'boolean':
    case 'undefined':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('Payload de idempotência com número não finito.');
      }
      return value;
    case 'bigint':
      return { $bigint: value.toString() };
    case 'object':
      return canonicalizeObject(value);
    default:
      throw new TypeError(`Payload de idempotência com tipo não suportado: ${typeof value}.`);
  }
}

function canonicalizeObject(value: object | null): unknown {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item) ?? null);
  }
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    return canonicalize(toJSON.call(value));
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Payload de idempotência com objeto não serializável (ex.: Map, Set).');
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])] as const)
      .filter(([, item]) => item !== undefined),
  );
}

export function hashRequest(operation: string, payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, canonicalize(payload)]))
    .digest('hex');
}
