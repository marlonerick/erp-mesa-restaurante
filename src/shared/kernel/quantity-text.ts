// Quantidade digitada pela pessoa ⇄ milésimos (RN-INV-04). Sem ponto flutuante.

const DECIMAL = /^(\d{1,11})(?:[.,](\d{1,3}))?$/;

/**
 * "1,5" → 1500; "1.5" → 1500; "0,250" → 250; "12" → 12000. Vírgula OU ponto como decimal, até 3
 * casas, sem separador de milhar ("1.500" = um e meio). Negativo, vazio ou inválido → null.
 */
export function parseQuantityText(input: string): number | null {
  const match = DECIMAL.exec(input.trim());
  if (!match) return null;
  const [, integerPart = '0', fraction = ''] = match;
  return Number(integerPart) * 1000 + Number(fraction.padEnd(3, '0'));
}

/**
 * Milésimos → texto para LER na tela, com ponto de milhar: 1 500 000 → "1.500"; 1500 → "1,5".
 * ATENÇÃO: para preencher um CAMPO use `formatQuantityInput` — "1.500" seria lido de volta como
 * um e meio (o ponto também é separador decimal na digitação, RN-INV-04).
 */
export function formatQuantityText(thousandths: number): string {
  return formatQuantity(thousandths, true);
}

/** Milésimos → valor de campo editável, sem ponto de milhar: 1 500 000 → "1500"; 1500 → "1,5". */
export function formatQuantityInput(thousandths: number): string {
  return formatQuantity(thousandths, false);
}

function formatQuantity(thousandths: number, grouping: boolean): string {
  const sign = thousandths < 0 ? '-' : '';
  const magnitude = Math.abs(thousandths);
  const digits = String(Math.trunc(magnitude / 1000));
  const integerPart = grouping ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : digits;
  const fraction = String(magnitude % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${sign}${integerPart}${fraction ? `,${fraction}` : ''}`;
}
