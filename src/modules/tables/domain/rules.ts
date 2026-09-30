import { DomainError } from '@/shared/kernel';

// Regras puras das mesas (docs/modules/tables.md §3).

export const TABLE_STATUSES = [
  'LIVRE',
  'OCUPADA',
  'AGUARDANDO_CONTA',
  'EM_PAGAMENTO',
  'LIMPEZA',
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

/** Texto de cada estado para a tela (cor nunca é a única informação). */
export const TABLE_STATUS_LABEL: Readonly<Record<TableStatus, string>> = {
  LIVRE: 'Livre',
  OCUPADA: 'Ocupada',
  AGUARDANDO_CONTA: 'Pediu a conta',
  EM_PAGAMENTO: 'Pagando',
  LIMPEZA: 'Limpeza',
};

/** Estados com conta aberta (RN-TAB-06). */
export const IN_USE: ReadonlySet<TableStatus> = new Set([
  'OCUPADA',
  'AGUARDANDO_CONTA',
  'EM_PAGAMENTO',
]);

export const DEFAULT_SEATS = 4;
const NUMBER_FORMAT = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u;

/** Número da mesa (RN-TAB-02): 1 a 10 letras/números, espaço ou hífen entre eles. */
export function tableNumber(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length < 1 || value.length > 10 || !NUMBER_FORMAT.test(value)) {
    throw new DomainError(
      'INVALID_TABLE_NUMBER',
      'Use de 1 a 10 letras ou números (ex.: 10, V1).',
      'VALIDATION',
    );
  }
  return value;
}

/** Área opcional ("Varanda"); vazio = sem área. */
export function tableArea(input: string | null | undefined): string | null {
  const value = (input ?? '').trim().replace(/\s+/g, ' ');
  if (value === '') return null;
  if (value.length > 40) {
    throw new DomainError('INVALID_TABLE_AREA', 'A área tem até 40 caracteres.', 'VALIDATION');
  }
  return value;
}

/** Lugares de 1 a 99. */
export function tableSeats(input: number): number {
  if (!Number.isInteger(input) || input < 1 || input > 99) {
    throw new DomainError('INVALID_SEATS', 'Informe de 1 a 99 lugares.', 'VALIDATION');
  }
  return input;
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Ordem do mapa (RN-TAB-07): por área (sem área por último) e número "natural" (2 antes de 10). */
export function compareTables(
  a: { readonly area: string | null; readonly number: string },
  b: { readonly area: string | null; readonly number: string },
): number {
  if (a.area !== b.area) {
    if (a.area === null) return 1;
    if (b.area === null) return -1;
    const byArea = collator.compare(a.area, b.area);
    if (byArea !== 0) return byArea;
  }
  return collator.compare(a.number, b.number);
}

/** Rótulo da conta com as mesas juntadas: "10 + 11" (ordem natural). */
export function tablesLabel(numbers: readonly string[]): string {
  return [...numbers].sort((a, b) => collator.compare(a, b)).join(' + ');
}
