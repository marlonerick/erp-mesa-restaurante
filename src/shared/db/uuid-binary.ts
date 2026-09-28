import { customType } from 'drizzle-orm/mysql-core';
import type { Id } from '../kernel';

const UUID_FORMAT = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * Converte UUID em 16 bytes. Recusa texto inválido: `Buffer.from(..., 'hex')` cortaria no primeiro
 * caractere inválido e o MySQL completaria com zeros — perigoso porque store_id isola as lojas.
 */
export function uuidToBuffer(id: string): Buffer {
  if (!UUID_FORMAT.test(id)) {
    throw new TypeError('UUID inválido para coluna BINARY(16).');
  }
  return Buffer.from(id.replaceAll('-', ''), 'hex');
}

export function bufferToUuid(buffer: Buffer): Id {
  if (buffer.length !== 16) {
    throw new RangeError(`UUID binário deve ter 16 bytes (recebeu ${String(buffer.length)})`);
  }
  const hex = buffer.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Id;
}

/** Coluna UUIDv7 armazenada em BINARY(16) (ADR-0004); no código é sempre o texto canônico. */
export const uuidBinary = customType<{ data: Id; driverData: Buffer }>({
  dataType: () => 'binary(16)',
  toDriver: uuidToBuffer,
  fromDriver: bufferToUuid,
});
