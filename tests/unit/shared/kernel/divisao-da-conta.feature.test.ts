import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { Money, Percentage } from '@/shared/kernel';

// Cenários BDD em português executados na camada de domínio (sem navegador)
const feature = await loadFeature('tests/features/dinheiro/divisao-da-conta.feature', {
  language: 'pt',
});

/** "R$ 1.234,56" → centavos */
function reais(text: string): Money {
  const digits = text.replace('R$', '').replaceAll('.', '').replace(',', '').trim();
  return Money.fromCents(Number(digits));
}

describeFeature(feature, ({ Scenario }) => {
  Scenario('Conta de R$ 100,00 dividida entre 3 pessoas', ({ Given, When, Then, And }) => {
    let total = Money.zero();
    let parts: Money[] = [];

    Given('uma conta de R$ 100,00', () => {
      total = reais('R$ 100,00');
    });
    When('a conta é dividida entre 3 pessoas', () => {
      parts = total.allocate(3);
    });
    Then('as partes são R$ 33,34, R$ 33,33 e R$ 33,33', () => {
      expect(parts).toEqual([reais('R$ 33,34'), reais('R$ 33,33'), reais('R$ 33,33')]);
    });
    And('a soma das partes é R$ 100,00', () => {
      expect(Money.sum(parts).equals(total)).toBe(true);
    });
  });

  Scenario('Taxa de serviço de 10% sobre a conta', ({ Given, When, Then }) => {
    let total = Money.zero();
    let fee = Money.zero();

    Given('uma conta de R$ 87,45', () => {
      total = reais('R$ 87,45');
    });
    When('aplico a taxa de serviço de 10%', () => {
      fee = total.percentage(Percentage.fromBasisPoints(1000));
    });
    Then('a taxa de serviço é R$ 8,75', () => {
      // 8,745 → arredonda meio centavo para cima (ADR-0003)
      expect(fee).toEqual(reais('R$ 8,75'));
    });
  });
});
