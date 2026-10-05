import { DomainError } from './errors';

// Datas LOCAIS da loja ("2026-03-14", dia operacional — ADR-0013) e períodos de relatório.
// Contas feitas em UTC sobre a data pura: não dependem do fuso do servidor.

const DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Período máximo de relatórios e do fluxo de caixa. */
export const MAX_PERIOD_DAYS = 366;

const invalidDate = () =>
  new DomainError('INVALID_DATE', 'Informe uma data válida (ex.: 2026-03-14).', 'VALIDATION');

/** "2026-03-14" válido (existe no calendário) → o mesmo texto; senão `INVALID_DATE`. */
export function parseLocalDate(text: string): string {
  const match = DATE_FORMAT.exec(text.trim());
  if (!match) throw invalidDate();
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw invalidDate();
  }
  return match[0];
}

/** Soma dias a uma data local: addDays("2026-02-28", 1) = "2026-03-01". */
export function addDays(date: string, days: number): string {
  const base = new Date(`${parseLocalDate(date)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Dias entre duas datas locais (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${parseLocalDate(to)}T00:00:00.000Z`) -
      Date.parse(`${parseLocalDate(from)}T00:00:00.000Z`)) /
      86_400_000,
  );
}

export interface Period {
  readonly from: string;
  readonly to: string;
}

/** Período de relatório: datas válidas, `from` ≤ `to`, até 366 dias (`INVALID_PERIOD`). */
export function validatePeriod(from: string, to: string): Period {
  const period = { from: parseLocalDate(from), to: parseLocalDate(to) };
  const days = daysBetween(period.from, period.to);
  if (days < 0 || days + 1 > MAX_PERIOD_DAYS) {
    throw new DomainError(
      'INVALID_PERIOD',
      `Escolha um período de até ${String(MAX_PERIOD_DAYS)} dias, com o início antes do fim.`,
      'VALIDATION',
    );
  }
  return period;
}
