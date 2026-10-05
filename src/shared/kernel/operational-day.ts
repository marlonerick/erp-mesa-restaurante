import { DomainError } from './errors';

/** Horário local no formato HH:MM (00:00 a 23:59). */
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Converte "HH:MM" em minutos desde a meia-noite; recusa formatos inválidos. */
export function parseLocalTime(value: string): number {
  const match = LOCAL_TIME.exec(value);
  if (!match) {
    throw new DomainError(
      'INVALID_CUTOFF',
      'Informe a virada do dia no formato HH:MM (00:00 a 23:59).',
      'VALIDATION',
    );
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

// Formatadores são caros de criar: um por fuso, reaproveitado
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23', // evita "24:00" à meia-noite
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Dia operacional de um instante (ADR-0013, RN-ORG-13): data local de (instante no fuso da loja −
 * virada). Antes da virada, o instante ainda pertence ao dia anterior. Resultado "YYYY-MM-DD".
 */
export function operationalDate(instant: Date, timeZone: string, cutoff: string): string {
  const cutoffMinutes = parseLocalTime(cutoff);
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  // Data do calendário local; Date.UTC normaliza "dia 0" para o último dia do mês anterior
  const local = new Date(Date.UTC(year, month - 1, minutes < cutoffMinutes ? day - 1 : day));
  return `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Diferença (ms) entre o horário local no fuso e o UTC, num instante. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/**
 * Instante (UTC) em que o dia operacional COMEÇA: a virada daquela data no fuso da loja (ADR-0013).
 * Inverso de `operationalDate`: o dia D vai de `operationalDayStart(D)` até `operationalDayStart(D+1)`.
 */
export function operationalDayStart(date: string, timeZone: string, cutoff: string): Date {
  const minutes = parseLocalTime(cutoff);
  const [year, month, day] = date.split('-').map(Number);
  const wall = Date.UTC(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  // Duas passadas acertam também os dias de mudança de horário de verão
  let guess = wall - offsetMs(new Date(wall), timeZone);
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
