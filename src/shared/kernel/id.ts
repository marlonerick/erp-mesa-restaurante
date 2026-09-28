import { validate, version, v7 as uuidv7 } from 'uuid';
import { DomainError } from './errors';

/** Identificador UUIDv7 em texto canônico minúsculo (ADR-0004). */
export type Id = string & { readonly __brand: 'Id' };

export function newId(): Id {
  return uuidv7() as Id;
}

export function isId(value: unknown): value is Id {
  return typeof value === 'string' && validate(value) && version(value) === 7;
}

export function parseId(value: string): Id {
  const normalized = value.toLowerCase();
  if (!isId(normalized)) {
    throw new DomainError('INVALID_ID', 'Identificador inválido.', 'VALIDATION');
  }
  return normalized;
}
