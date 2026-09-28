import { customType } from 'drizzle-orm/mysql-core';
import type { Id } from '../kernel';

export function uuidToBuffer(id: string): Buffer {
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
