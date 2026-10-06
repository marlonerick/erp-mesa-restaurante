import { expect, test } from '@playwright/test';
import { becomeCashier, openCash } from './cash-helpers';
import {
  addItem,
  closeDialog,
  createTables,
  openTable,
  sendRound,
  tableNumber,
} from './floor-helpers';
import { login, TEAM } from './helpers';

// Cenários de falha obrigatórios do README B.11 que precisam do navegador (Etapa 10): internet
// caindo no envio do pedido e no pagamento, e sessão expirada no meio da operação. Os demais
// estão nos testes de integração (mapa em docs/testing/cenarios-de-falha.md).

test.describe('Falhas de rede e de sessão (Etapa 10)', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(({}, testInfo) => {
    // Rede e sessão não dependem do tamanho da tela: um aparelho basta
    test.skip(testInfo.project.name !== 'desktop', 'falhas de rede rodam só no computador');
  });

  test('internet cai ao enviar o pedido: avisa, e reenviar manda uma rodada só', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openTable(page, number);
    await addItem(page, 'X-Salada');
    await closeDialog(page);

    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Enviar para a cozinha (1)' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /conex|internet/i })).toBeVisible();

    await page.context().setOffline(false);
    await sendRound(page, 1);
    await expect(page.getByRole('list', { name: 'Rodada 1' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Rodada 2' })).toHaveCount(0);
  });

  test('internet cai ao receber: avisa, e receber de novo cobra uma vez só', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    const waiterContext = await browser.newContext();
    const waiter = await waiterContext.newPage();
    await login(waiter, TEAM.joao.username, TEAM.joao.password);
    await openTable(waiter, number);
    await addItem(waiter, 'Refrigerante lata');
    await closeDialog(waiter);
    await sendRound(waiter, 1);
    await waiterContext.close();

    await becomeCashier(page);
    await openCash(page, '0,00');
    await page.goto('/pdv');
    await page
      .getByRole('list', { name: 'Contas a receber' })
      .getByRole('link', { name: new RegExp(`Mesa ${number}`) })
      .click();

    const receive = page.getByRole('button', { name: 'Receber', exact: true });
    await page.getByLabel('Valor (R$)').fill('5,00');
    await page.getByLabel(/Confirmei que o pagamento foi aprovado/).check();
    await page.context().setOffline(true);
    await receive.click();
    await expect(page.getByRole('alert').filter({ hasText: /conex|internet/i })).toBeVisible();

    await page.context().setOffline(false);
    await receive.click();
    await expect(page.getByRole('status').filter({ hasText: 'Recebido R$ 5,00.' })).toBeVisible();
    // Um pagamento só (a mesma chave de idempotência nos dois toques — R-03)
    await page.reload();
    await expect(page.getByRole('list', { name: 'Pagamentos' }).getByRole('listitem')).toHaveCount(
      1,
    );
  });

  test('sessão expirada no meio da comanda: volta ao login e nada se perde', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    await login(page, TEAM.ana.username, TEAM.ana.password);
    await openTable(page, number);
    await addItem(page, 'X-Salada');
    await closeDialog(page);
    const comanda = page.url();

    // A sessão acaba (12 h sem uso, 7 dias, desativada…): o cookie deixa de valer
    await page.context().clearCookies();
    await page.getByRole('button', { name: 'Enviar para a cozinha (1)' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Entra de novo: o item lançado continua lá, esperando envio
    await login(page, TEAM.ana.username, TEAM.ana.password);
    await page.goto(comanda);
    await sendRound(page, 1);
  });
});
