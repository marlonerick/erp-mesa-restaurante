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
