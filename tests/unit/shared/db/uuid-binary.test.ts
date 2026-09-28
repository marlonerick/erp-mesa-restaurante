import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bufferToUuid, uuidToBuffer } from '@/shared/db/uuid-binary';
import { newId } from '@/shared/kernel';

describe('conversão UUID ↔ BINARY(16)', () => {
  it('converte para 16 bytes e volta ao mesmo texto', () => {
    const id = newId();
    const buffer = uuidToBuffer(id);
    expect(buffer).toHaveLength(16);
    expect(bufferToUuid(buffer)).toBe(id);
  });

  it('é estável para qualquer UUID (propriedade)', () => {
    fc.assert(
      fc.property(fc.uuid({ version: 7 }), (uuid) => {
        expect(bufferToUuid(uuidToBuffer(uuid.toLowerCase()))).toBe(uuid.toLowerCase());
      }),
    );
  });

  it('recusa buffer com tamanho diferente de 16 bytes', () => {
    expect(() => bufferToUuid(Buffer.alloc(8))).toThrow(/16 bytes/);
  });
});
