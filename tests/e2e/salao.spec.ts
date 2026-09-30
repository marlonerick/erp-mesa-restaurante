import { type Browser, expect, type Page, test } from '@playwright/test';
import { login, openMenuIfMobile, TEAM } from './helpers';

// Salão e comanda (Etapa 6). Cada teste cadastra as PRÓPRIAS mesas (número único): os três
// aparelhos rodam ao mesmo tempo no mesmo banco de E2E.

const PIN_GERENTE = '739104';

/** Número de mesa único (até 10 letras/números — RN-TAB-02). */
const tableNumber = () => `E${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** O gerente cadastra as mesas numa sessão separada (outro aparelho). */
async function createTables(browser: Browser, numbers: readonly string[]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, TEAM.gerente.username, TEAM.gerente.password);
  for (const number of numbers) {
    await page.goto('/mesas');
    await page.getByLabel('Número', { exact: true }).fill(number);
    await page.getByLabel('Área (opcional)').fill('Testes E2E');
    await page.getByRole('button', { name: 'Cadastrar mesa' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mesa cadastrada.' })).toBeVisible();
  }
  await context.close();
}

async function openTable(page: Page, number: string) {
  await page.goto('/salao');
  await page.getByRole('button', { name: new RegExp(`^Mesa ${number}\\b`) }).click();
  await page.getByLabel('Pessoas (opcional)').fill('2');
  await page.getByRole('button', { name: 'Abrir mesa' }).click();
  await page.waitForURL(/\/salao\/comanda\/.+/);
  await expect(page.getByRole('heading', { name: `Mesa ${number}`, level: 1 })).toBeVisible();
}

async function addItem(page: Page, product: string, choose: readonly string[] = []) {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) {
    await page.getByRole('button', { name: 'Adicionar item' }).click();
  }
  await dialog.getByLabel('Buscar produto').fill(product);
  await dialog.getByRole('button', { name: new RegExp(`^${product}`) }).click();
  for (const option of choose) await dialog.getByLabel(option).check();
  await dialog.getByRole('button', { name: 'Lançar na conta' }).click();
  await expect(dialog.getByRole('status')).toContainText('Item lançado');
}

async function closeDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar janela' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function sendRound(page: Page) {
  await page.getByRole('button', { name: /^Enviar para a cozinha/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Rodada \d+ enviada/ })).toBeVisible();
}

test.describe('Salão e comanda (Etapa 6)', () => {
  test('garçom abre a mesa, lança com adicionais e observação, envia e pede a conta', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openTable(page, number);

    await page.getByRole('button', { name: 'Adicionar item' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Buscar produto').fill('x-bur');
    await dialog.getByRole('button', { name: /^X-Burger/ }).click();
    await dialog.getByRole('button', { name: 'Aumentar quantidade' }).click();
    await dialog.getByLabel('Ao ponto').check();
    await dialog.getByLabel('Bacon').check();
    await dialog.getByLabel('Observação (opcional)').fill('sem cebola');
    // (32,00 + 5,00) × 2
    await expect(dialog.getByText('Total do item: R$ 74,00')).toBeVisible();
    await dialog.getByRole('button', { name: 'Lançar na conta' }).click();
    await expect(dialog.getByRole('status')).toContainText('Item lançado');
    await closeDialog(page);

    const pending = page.getByRole('list', { name: 'Itens não enviados' });
    await expect(pending).toContainText('2 × X-Burger');
    await expect(pending).toContainText('Ao ponto');
    await expect(pending).toContainText('Bacon');
    await expect(pending).toContainText('Obs.: sem cebola');
    await expect(page.getByText('Subtotal R$ 74,00')).toBeVisible();

    await sendRound(page);
    const round = page.getByRole('list', { name: 'Rodada 1' });
    await expect(round).toContainText('Na cozinha');
    await expect(page.getByText('Nenhum item esperando envio.')).toBeVisible();

    await page.getByRole('button', { name: 'Pedir a conta' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Conta pedida' })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para o salão' }).click();
    await expect(
      page.getByRole('link', { name: new RegExp(`Mesa ${number}.*Pediu a conta`) }),
    ).toBeVisible();
  });

  test('bebida sem preparo fica pronta; cancelar item enviado pede o PIN do gerente', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openTable(page, number);

    await addItem(page, 'Refrigerante lata');
    await addItem(page, 'X-Salada');
    await closeDialog(page);
    await sendRound(page);
    const round = page.getByRole('list', { name: 'Rodada 1' });
    await expect(
      round.getByRole('listitem').filter({ hasText: 'Refrigerante lata' }),
    ).toContainText('Pronto');
    await page.getByRole('button', { name: 'Entregar Refrigerante lata' }).click();
    await expect(
      round.getByRole('listitem').filter({ hasText: 'Refrigerante lata' }),
    ).toContainText('Entregue');

    // Garçom não tem orders.cancel: o gerente digita usuário e PIN neste aparelho
    await page.getByRole('button', { name: 'Cancelar X-Salada' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('os insumos voltam para o estoque');
    await dialog.getByLabel('Motivo').fill('cliente desistiu');
    await dialog.getByLabel('Usuário do gerente').fill(TEAM.gerente.username);
    // Sem PIN errado de propósito: cada erro conta para travar o PIN do gerente, que é o MESMO
    // usuário para todos os testes em paralelo (PIN errado já é testado na integração)
    await dialog.getByLabel('PIN do gerente').fill(PIN_GERENTE);
    await dialog.getByRole('button', { name: 'Cancelar item' }).click();
    // Cancelado, o item perde o botão "Cancelar" e a janela fecha; a linha mostra o motivo
    const cancelled = round.getByRole('listitem').filter({ hasText: 'X-Salada' });
    await expect(cancelled).toContainText('Cancelado');
    await expect(cancelled).toContainText('Motivo: cliente desistiu');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Subtotal R$ 7,00')).toBeVisible();
  });

  test('transferir e juntar mesas; cancelar conta aberta por engano', async ({ page, browser }) => {
    const [a, b, c] = [tableNumber(), tableNumber(), tableNumber()];
    await createTables(browser, [a, b, c]);
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openTable(page, a);
    await addItem(page, 'Pudim');
    await closeDialog(page);
    await sendRound(page);

    await page.getByRole('button', { name: 'Transferir' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Para a mesa').selectOption({ label: `Mesa ${b} · Testes E2E` });
    await dialog.getByRole('button', { name: 'Transferir' }).click();
    await expect(dialog.getByRole('status')).toContainText('Conta transferida.');
    await closeDialog(page);
    await expect(page.getByRole('heading', { name: `Mesa ${b}`, level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Juntar mesa' }).click();
    await dialog.getByLabel('Mesa', { exact: true }).selectOption({ label: `Mesa ${c} · Livre` });
    await dialog.getByRole('button', { name: 'Juntar' }).click();
    await expect(dialog.getByRole('status')).toContainText('Mesas juntadas');
    await closeDialog(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(b);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(c);

    await page.getByRole('link', { name: 'Voltar para o salão' }).click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^Mesa ${a}\\b.*Livre`) }),
    ).toBeVisible();

    // Conta aberta por engano: cancelada sem nada enviado, a mesa volta a ficar livre
    await openTable(page, a);
    await page.getByRole('button', { name: 'Cancelar conta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar conta' }).click();
    await page.waitForURL(/\/salao$/);
    await expect(
      page.getByRole('button', { name: new RegExp(`^Mesa ${a}\\b.*Livre`) }),
    ).toBeVisible();
  });

  test('pedido de balcão com nome livre', async ({ page }) => {
    const name = `Cliente ${Math.random().toString(36).slice(2, 6)}`;
    await login(page, TEAM.ana.username, TEAM.ana.password);
    await page.goto('/salao');
    await page.getByRole('button', { name: 'Novo pedido de balcão' }).click();
    await page.getByLabel('Nome do cliente').fill(name);
    await page.getByRole('button', { name: 'Abrir pedido' }).click();
    await page.waitForURL(/\/salao\/comanda\/.+/);
    await expect(page.getByRole('heading', { name: `Balcão · ${name}`, level: 1 })).toBeVisible();
    await addItem(page, 'Água sem gás');
    await closeDialog(page);
    await page.getByRole('link', { name: 'Voltar para o salão' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Pedidos de balcão' })
        .getByRole('link', { name: new RegExp(name) }),
    ).toContainText('1 não enviado(s)');
  });

  test('permissões: garçom não cadastra mesa; cozinha não vê o salão', async ({
    page,
    browser,
  }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await page.goto('/mesas');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    await openMenuIfMobile(page);
    await expect(page.getByRole('link', { name: 'Salão' })).toBeVisible();

    // Outro aparelho: a cozinha
    const context = await browser.newContext();
    const kitchen = await context.newPage();
    await login(kitchen, 'cozinha', 'Cozinha@2026');
    await kitchen.goto('/salao');
    await expect(kitchen.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    const api = await kitchen.request.get('/api/salao');
    expect(api.status()).toBe(403);
    await context.close();
  });

  test('salão e comanda cabem na largura do aparelho', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await page.goto('/salao');
    await page
      .getByRole('link', { name: /^Mesa 2\b/ })
      .first()
      .click();
    await page.waitForURL(/\/salao\/comanda\/.+/);
    for (const path of ['/salao', page.url()]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
