import { createHash } from 'node:crypto';

/** JSON com chaves ordenadas, para que {a,b} e {b,a} produzam o mesmo hash. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function hashRequest(operation: string, payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify([operation, canonicalize(payload)]))
    .digest('hex');
}
