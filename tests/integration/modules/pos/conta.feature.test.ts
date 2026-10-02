import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { BillTotals } from '@/modules/pos';
import { useTestDatabase } from '../../../support/database';
import { posBackground } from './pos-background';
import { money, posWorld } from './pos-world';

const feature = await loadFeature('tests/features/pos/conta.feature', { language: 'pt' });
const { db } = useTestDatabase();

describeFeature(feature, ({ Background, Scenario }) => {
  const w = posWorld(db);
  let totals: BillTotals | null = null;
  const shown = () => {
    if (!totals) throw new Error('a conta não foi aberta no cenário');
    return totals;
  };
  const expectTotals = (expected: Partial<Record<keyof BillTotals, string>>) => {
    const current = shown();
    for (const [key, value] of Object.entries(expected)) {
      expect(money(current[key as keyof BillTotals]), key).toBe(value);
    }
  };
  const openBill = async (target: { table: string } | { counter: string }) => {
    totals = (await w.bill(target)).totals;
  };

  Background(({ Given, And }) => {
    posBackground(w, Given, And);
  });

  Scenario('Taxa de serviço de 10% sobre os itens', ({ When, Then }) => {
    When('"bia" abre a conta da mesa "10"', () => openBill({ table: '10' }));
    Then('a conta mostra itens "71,00", taxa de serviço "7,10" e total "78,10"', () => {
      expectTotals({ itemsCents: '71,00', serviceFeeCents: '7,10', totalCents: '78,10' });
    });
  });

  Scenario('Taxa calculada depois do desconto', ({ Given, When, Then }) => {
    Given(
      '"bia" deu desconto de "5" por cento na conta da mesa "10" pelo motivo "cliente frequente"',
      () => w.discountOrder('bia', { table: '10' }, 'PERCENTUAL', 500, 'cliente frequente'),
    );
    When('"bia" abre a conta da mesa "10"', () => openBill({ table: '10' }));
    Then('a conta mostra desconto na conta "3,55", taxa de serviço "6,75" e total "74,20"', () => {
      expectTotals({
        orderDiscountCents: '3,55',
        serviceFeeCents: '6,75',
        totalCents: '74,20',
      });
    });
  });

  Scenario('Balcão não tem taxa de serviço', ({ Given, When, Then }) => {
    Given('"joão" enviou 1 "X-Burger" para o balcão "Ana"', () =>
      w.sendToCounter('joão', 'Ana', 1, 'X-Burger'),
    );
    When('"bia" abre a conta do balcão "Ana"', () => openBill({ counter: 'Ana' }));
    Then('a conta mostra itens "32,00", taxa de serviço "0,00" e total "32,00"', () => {
      expectTotals({ itemsCents: '32,00', serviceFeeCents: '0,00', totalCents: '32,00' });
    });
  });

  Scenario('Desconto acima do limite do caixa pede o PIN do gerente', ({ When, Then, And }) => {
    When(
      '"bia" tenta dar desconto de "20" por cento na conta da mesa "10" pelo motivo "reclamação"',
      () =>
        w.attempt(() => w.discountOrder('bia', { table: '10' }, 'PERCENTUAL', 2000, 'reclamação')),
    );
    Then('a ação é recusada com o código "FORBIDDEN"', () => {
      w.expectFailure('FORBIDDEN');
      expect(w.failure).toMatchObject({ details: { elevationAllowed: true } });
    });
    When(
      '"carla" autoriza no aparelho de "bia" o desconto acima do limite com o PIN "246810"',
      () => w.authorizeFor('carla', 'bia', 'discounts.apply_above_limit', '246810'),
    );
    And('"bia" dá desconto de "20" por cento na conta da mesa "10" pelo motivo "reclamação"', () =>
      w.discountOrder('bia', { table: '10' }, 'PERCENTUAL', 2000, 'reclamação'),
    );
    Then('a conta mostra desconto na conta "14,20"', async () => {
      await openBill({ table: '10' });
      expectTotals({ orderDiscountCents: '14,20' });
    });
    And('a auditoria registra "DISCOUNT_APPLIED" feito por "bia" com autorização de "carla"', () =>
      w.expectAudit('DISCOUNT_APPLIED', 'bia', 'carla'),
    );
  });

  Scenario('Desconto no item', ({ When, Then }) => {
    When('"bia" dá desconto de "4,00" no primeiro item da mesa "10" pelo motivo "demorou"', () =>
      w.discountItem('bia', '10', 0, '4,00', 'demorou'),
    );
    Then('a conta mostra itens "71,00", desconto nos itens "4,00" e total "73,70"', async () => {
      await openBill({ table: '10' });
      expectTotals({ itemsCents: '71,00', itemDiscountsCents: '4,00', totalCents: '73,70' });
    });
  });

  Scenario('Retirar a taxa de serviço exige o gerente', ({ When, Then, And }) => {
    When('"carla" retira a taxa de serviço da mesa "10" pelo motivo "cliente reclamou"', () =>
      w.serviceFee('carla', '10', true, 'cliente reclamou'),
    );
    Then('a conta mostra taxa de serviço "0,00" e total "71,00"', async () => {
      await openBill({ table: '10' });
      expectTotals({ serviceFeeCents: '0,00', totalCents: '71,00' });
    });
    And('a auditoria registra "SERVICE_FEE_REMOVED" feito por "carla"', () =>
      w.expectAudit('SERVICE_FEE_REMOVED', 'carla'),
    );
  });

  Scenario('Pré-conta leva a mesa para pagamento', ({ When, Then, And }) => {
    When('"bia" emite a pré-conta da mesa "10"', () => w.preBill('bia', '10'));
    Then('a mesa "10" está "EM_PAGAMENTO"', async () => {
      expect(await w.tableStatus('10')).toBe('EM_PAGAMENTO');
    });
    And('a auditoria registra "PRE_BILL_ISSUED" feito por "bia"', () =>
      w.expectAudit('PRE_BILL_ISSUED', 'bia'),
    );
  });

  Scenario('Pré-conta com item não enviado é recusada', ({ Given, When, Then }) => {
    Given('"joão" lançou 1 "X-Burger" na mesa "10"', () =>
      w.add('joão', { table: '10' }, 1, 'X-Burger'),
    );
    When('"bia" tenta emitir a pré-conta da mesa "10"', () =>
      w.attempt(() => w.preBill('bia', '10')),
    );
    Then('a ação é recusada com o código "PENDING_ITEMS"', () => {
      w.expectFailure('PENDING_ITEMS');
    });
  });
});
