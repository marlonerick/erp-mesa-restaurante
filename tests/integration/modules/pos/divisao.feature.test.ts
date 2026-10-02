import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { splitEvenly } from '@/modules/pos';
import { useTestDatabase } from '../../../support/database';
import { money, posWorld } from './pos-world';

const feature = await loadFeature('tests/features/pos/divisao.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = posWorld(db);
  const mesa10 = { table: '10' };
  const closed = async () => {
    const detail = await w.bill(mesa10);
    expect(detail.order.status).toBe('FECHADO');
    expect(money(detail.totals.totalCents)).toBe('78,10');
  };

  Background(({ Given, And }) => {
    Given('que "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"', async () => {
      await w.newOrganization();
      await w.withTerminal('bia', 'CAIXA', 'CX01');
    });
    And('"joão" é garçom na loja "Centro"', () => w.person('joão', 'GARCOM'));
    And('a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"', () =>
      w.sells('X-Burger', '32,00', { modifier: ['Bacon', '5,00'] }),
    );
    And('a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo', () =>
      w.sells('Refrigerante lata', '7,00', { noPrep: true }),
    );
    And('existe a mesa "10" no "Centro"', () => w.createTable('10'));
    And('"joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"', () =>
      w.sendTo('joão', '10', [
        { quantity: 2, product: 'X-Burger' },
        { quantity: 1, product: 'Refrigerante lata' },
      ]),
    );
    And('"bia" abriu o caixa com "100,00" de fundo de troco', () => w.openCash('bia', '100,00'));
  });

  Scenario('Dividir por 3 pessoas', ({ When, Then }) => {
    When('"bia" divide a conta da mesa "10" por 3 pessoas', async () => {
      w.splitEvenly((await w.bill(mesa10)).totals.balanceCents, 3, splitEvenly);
    });
    Then('as partes são "26,04", "26,03" e "26,03"', () => {
      expect(w.parts.map(money)).toEqual(['26,04', '26,03', '26,03']);
    });
    When('"bia" recebe as 3 partes no PIX da mesa "10"', async () => {
      for (const part of w.parts) await w.pay('bia', mesa10, 'PIX', money(part));
    });
    Then('a conta da mesa "10" está "FECHADO" com total "78,10"', closed);
  });

  Scenario('Pagar só os próprios itens', ({ When, Then, And }) => {
    const onlyDrink = async () =>
      w.pay('bia', mesa10, 'PIX', null, {
        itemIds: [await w.itemIdByName('10', 'Refrigerante lata')],
      });
    When('"bia" recebe no PIX da mesa "10" só o "Refrigerante lata"', onlyDrink);
    Then('o pagamento foi de "7,70"', () => {
      expect(money(w.lastPay.amountCents)).toBe('7,70');
    });
    And('o "Refrigerante lata" da mesa "10" está pago', async () => {
      const detail = await w.bill(mesa10);
      expect(detail.items.find((item) => item.productName === 'Refrigerante lata')?.paid).toBe(
        true,
      );
    });
    When('"bia" tenta receber no PIX da mesa "10" só o "Refrigerante lata"', () =>
      w.attempt(onlyDrink),
    );
    Then('a ação é recusada com o código "ITEM_ALREADY_PAID"', () => {
      w.expectFailure('ITEM_ALREADY_PAID');
    });
    When('"bia" recebe "70,40" em dinheiro da mesa "10"', () =>
      w.pay('bia', mesa10, 'DINHEIRO', '70,40'),
    );
    Then('a conta da mesa "10" está "FECHADO" com total "78,10"', closed);
  });
});
