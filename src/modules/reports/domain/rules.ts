import { divideRoundHalfUp } from '@/shared/kernel';

// Regras puras dos relatórios (docs/modules/reports.md §3). Centavos inteiros (ADR-0003).

export const REPORT_PAGE_SIZE = 50;
/** Limite de linhas do CSV (RN-REP-09). */
export const CSV_MAX_ROWS = 10_000;
/** Painel: 5 mais vendidos (RN-REP-03). */
export const TOP_PRODUCTS = 5;

/** Ticket médio = total ÷ contas, half-up; sem contas = 0 (RN-REP-02). */
export function averageTicket(totalCents: number, orders: number): number {
  if (orders <= 0) return 0;
  return Number(divideRoundHalfUp(BigInt(totalCents), BigInt(orders)));
}

/** Margem do produto (E9-7): valor bruto − descontos nos itens − custo. */
export const margin = (grossCents: number, discountCents: number, costCents: number) =>
  grossCents - discountCents - costCents;

/** Centavos → "1234,50" (sem separador de milhar: o Excel lê como número). */
export function csvMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = Math.abs(cents);
  return `${sign}${String(Math.trunc(value / 100))},${String(value % 100).padStart(2, '0')}`;
}

/** Marca no início do arquivo para o Excel abrir em UTF-8. */
const BOM = String.fromCharCode(0xfeff);
/** Número escrito por nós (csvMoney, contagens): "-5,50", "12", "0,05". */
const PLAIN_NUMBER = /^-?\d+(,\d+)?$/;

/** Célula CSV: texto com `;`, aspas ou quebra de linha vai entre aspas (aspas dobradas). */
function cell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  // Evita que o Excel execute fórmulas vindas de texto digitado (injeção de CSV): todo texto que
  // começa com = + - @ tab ou CR ganha um apóstrofo — menos um número inteiro como "-5,50"
  // ("-1+1" é fórmula: achado I-1 da revisão)
  const formula = /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text);
  const safe = formula && typeof value === 'string' ? `'${text}` : text;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV para o Excel brasileiro (RN-REP-09): separador `;`, vírgula decimal, quebra de linha CRLF e
 * BOM no início (acentos corretos ao abrir com dois cliques).
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
