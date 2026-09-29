// Valor em reais digitado pela pessoa ⇄ centavos (RN-CAT-08). Sem ponto flutuante: o texto é
// separado em reais e centavos e montado com inteiros (ADR-0003).

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
const PLAIN = /^\d{1,9}$/;

function wholeReais(text: string): number | null {
  if (PLAIN.test(text)) return Number(text);
  // "1.234" = mil duzentos e trinta e quatro (ponto separando milhares)
  if (THOUSANDS.test(text) && text.replaceAll('.', '').length <= 9) {
    return Number(text.replaceAll('.', ''));
  }
  return null;
}

/**
 * "32" → 3200; "32,5" → 3250; "1.234,50" → 123450; "R$ 32,50" → 3250; "32.50" → 3250 (ponto com
 * 1 ou 2 dígitos depois = centavos, como no teclado numérico). Texto que não é um valor, negativo
 * ou com mais de 2 casas decimais → null (quem chama decide a mensagem e os limites).
 */
export function parseMoneyText(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/i, '');
  let reais: number | null;
  let cents = '';
  const comma = text.split(',');
  if (comma.length > 2) return null;
  if (comma.length === 2) {
    reais = wholeReais(comma[0] ?? '');
    cents = comma[1] ?? '';
  } else {
    const decimalPoint = /^(\d{1,9})\.(\d{1,2})$/.exec(text);
    if (decimalPoint) {
      reais = Number(decimalPoint[1]);
      cents = decimalPoint[2] ?? '';
    } else {
      reais = wholeReais(text);
    }
  }
  if (reais === null || !/^\d{0,2}$/.test(cents)) return null;
  return reais * 100 + Number(cents.padEnd(2, '0'));
}

/** Centavos → texto da tela, sem "R$": 123450 → "1.234,50"; 3200 → "32,00". */
export function formatMoneyText(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const magnitude = Math.abs(cents);
  const reais = String(Math.trunc(magnitude / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${reais},${String(magnitude % 100).padStart(2, '0')}`;
}
