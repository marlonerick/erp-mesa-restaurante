import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { averageTicket, csvMoney, margin, toCsv } from '@/modules/reports/domain/rules';

describe('indicadores (RN-REP-02, E9-7)', () => {
  it('ticket médio arredonda meio centavo para cima; sem contas = 0', () => {
    expect(averageTicket(11_010, 2)).toBe(5505);
    expect(averageTicket(1001, 2)).toBe(501);
    expect(averageTicket(1000, 3)).toBe(333);
    expect(averageTicket(5000, 0)).toBe(0);
  });

  it('ticket médio × contas fica a menos de meia conta do total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 1, max: 5000 }),
        (total, orders) => {
          expect(Math.abs(averageTicket(total, orders) * orders - total)).toBeLessThanOrEqual(
            orders / 2,
          );
        },
      ),
    );
  });

  it('margem = valor − descontos − custo (pode ser negativa)', () => {
    expect(margin(6400, 0, 1200)).toBe(5200);
    expect(margin(1000, 300, 900)).toBe(-200);
  });
});

describe('CSV para o Excel brasileiro (RN-REP-09)', () => {
  it('valores com vírgula decimal e sem separador de milhar', () => {
    expect(csvMoney(123_450)).toBe('1234,50');
    expect(csvMoney(5)).toBe('0,05');
    expect(csvMoney(-550)).toBe('-5,50');
    expect(csvMoney(0)).toBe('0,00');
  });

  it('BOM, separador ";" e quebra de linha CRLF', () => {
    const csv = toCsv(['Produto', 'Valor'], [['X-Burger', csvMoney(6400)]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Produto;Valor\r\nX-Burger;64,00\r\n');
  });

  it('texto com ";", aspas ou quebra de linha vai entre aspas', () => {
    expect(toCsv(['a'], [['Pão; queijo'], ['diz "oi"'], ['linha\n2']]).slice(1)).toBe(
      'a\r\n"Pão; queijo"\r\n"diz ""oi"""\r\n"linha\n2"\r\n',
    );
  });

  it('texto que o Excel leria como fórmula vira texto; número negativo continua número', () => {
    expect(
      toCsv(['a'], [['=HYPERLINK("x")'], ['+1'], ['@SOMA'], ['-A1'], ['-5,50']]).slice(1),
    ).toBe('a\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'@SOMA\r\n\'-A1\r\n-5,50\r\n');
    expect(toCsv(['a'], [[-550], [null]]).slice(1)).toBe('a\r\n-550\r\n\r\n');
  });
});
