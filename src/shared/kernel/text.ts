import { DomainError } from './errors';

/** Nome sem espaços sobrando, dentro do tamanho (lojas, terminais, produtos, categorias...). */
export function normalizeName(input: string, min: number, max: number): string {
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < min || name.length > max) {
    throw new DomainError(
      'INVALID_NAME',
      `Informe um nome entre ${String(min)} e ${String(max)} caracteres.`,
      'VALIDATION',
    );
  }
  return name;
}
