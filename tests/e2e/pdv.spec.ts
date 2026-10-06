import { expect, type Page, test } from '@playwright/test';
import {
  addItem,
  closeDialog,
  createTables,
  openTable,
  sendRound,
  tableNumber,
} from './floor-helpers';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

// PDV e caixa (Etapa 8). Cada teste vincula um terminal de caixa PRÓPRIO a este navegador e abre
// o próprio caixa (a loja de demonstração aceita 5 caixas abertos — Q-05).

/** O gerente cadastra um terminal de caixa e vincula ESTE navegador; depois entra o caixa. */
async function becomeCashier(page: Page) {
  const code = unique('PDV').replace('.', '-').toUpperCase().slice(0, 20);
  const name = `Caixa ${code}`;
  await login(page, TEAM.gerente.username, TEAM.gerente.password);
  await page.goto('/admin/terminais');
  await page.getByLabel('Código', { exact: true }).fill(code);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Cadastrar terminal' }).click();
  await expect(page.getByRole('status')).toHaveText('Terminal cadastrado.');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: `Usar este aparelho como ${name}` }).click();
  await expect(page.getByRole('status')).toHaveText('Pronto: este aparelho agora é este terminal.');
  await openMenuIfMobile(page);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, TEAM.caixa.username, TEAM.caixa.password);
}

async function openCash(page: Page, amount: string) {
  await page.goto('/caixa');
  await page.getByLabel('Fundo de troco (R$)').fill(amount);
  await page.getByRole('button', { name: 'Abrir caixa' }).click();
  await expect(page.getByRole('heading', { name: 'Caixa aberto' })).toBeVisible();
}

test.describe('PDV e caixa (Etapa 8)', () => {
  // Três aparelhos (gerente/caixa, garçom) e várias telas por teste
  test.describe.configure({ timeout: 90_000 });

  test('caixa abre, emite a pré-conta, recebe PIX + dinheiro com troco e fecha às cegas', async ({
    page,
    browser,
  }) => {
    // A janela de impressão do navegador é substituída por um contador
    await page.addInitScript(() => {
      const counter = window as unknown as { printed: number };
      counter.printed = 0;
      window.print = () => {
        counter.printed += 1;
      };
    });
    const number = tableNumber();
    await createTables(browser, [number]);
    const context = await browser.newContext();
    const waiter = await context.newPage();
    await login(waiter, TEAM.joao.username, TEAM.joao.password);
    await openTable(waiter, number);
    await addItem(waiter, 'X-Salada');
    await addItem(waiter, 'Refrigerante lata');
    await closeDialog(waiter);
    await sendRound(waiter, 2);
    await context.close();

    await becomeCashier(page);
    await openCash(page, '100,00');

    await page.goto('/pdv');
    await page
      .getByRole('list', { name: 'Contas a receber' })
      .getByRole('link', { name: new RegExp(`Mesa ${number}`) })
      .click();
    await expect(page.getByRole('heading', { name: `Mesa ${number}`, level: 1 })).toBeVisible();
    // 28,00 + 7,00 = 35,00 + 10% = 38,50
    await expect(page.getByText('R$ 38,50').first()).toBeVisible();

    await page.getByRole('button', { name: 'Emitir pré-conta' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Pré-conta emitida' })).toBeVisible();
    await expect(page.getByTestId('pre-conta')).toContainText('NÃO É DOCUMENTO FISCAL');
    await expect(page.getByTestId('pre-conta')).toContainText('TOTAL: R$ 38,50');
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    // PIX de 20,00: a confirmação manual é obrigatória para habilitar o botão
    const receive = page.getByRole('button', { name: 'Receber', exact: true });
    await page.getByLabel('Valor (R$)').fill('20,00');
    await expect(receive).toBeDisabled();
    await page.getByLabel(/Confirmei que o pagamento foi aprovado/).check();
    await receive.click();
    await expect(page.getByRole('status').filter({ hasText: 'Recebido R$ 20,00.' })).toBeVisible();

    // Dinheiro: entregou 20,00 para 18,50 → troco 1,50 e a conta fecha
    // O botão de rádio fica escondido: a pessoa toca no rótulo grande
    await page
      .locator('label')
      .filter({ hasText: /^Dinheiro$/ })
      .click();
    await page.getByLabel('Valor recebido (R$)').fill('20,00');
    await receive.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Troco: R$ 1,50. Conta paga e fechada.' }),
    ).toBeVisible();
    await expect(page.getByText(/Conta paga e fechada\. A mesa foi para limpeza\./)).toBeVisible();

    // Fechamento cego: o esperado só aparece depois de fechar
    await page.goto('/caixa');
    await expect(page.getByText('R$ 118,50')).toHaveCount(0);
    await page.getByLabel('Dinheiro na gaveta (R$)').fill('118,50');
    await page.getByRole('button', { name: 'Fechar caixa' }).click();
    await page.waitForURL(/\/caixa\/.+/);
    const cash = page.getByRole('row', { name: /^Dinheiro/ });
    await expect(cash).toContainText('R$ 118,50');
    await expect(cash).toContainText('Confere');
    await expect(page.getByRole('row', { name: /^PIX/ })).toContainText('não conferido');
  });

  test('fechamento: contador de cédulas e uma recontagem quando o dinheiro não bate (E10-6)', async ({
    page,
  }) => {
    await becomeCashier(page);
    await openCash(page, '100,00');

    // Contador: 1 nota de R$ 50 + 2 de R$ 20 = R$ 90,00 (faltam R$ 10)
    await page.getByText('Contar cédulas e moedas').click();
    await page.getByLabel('Notas de R$ 50', { exact: true }).fill('1');
    await page.getByLabel('Notas de R$ 20', { exact: true }).fill('2');
    await expect(page.getByText('Total contado:')).toContainText('R$ 90,00');
    await page.getByRole('button', { name: 'Usar este total' }).click();
    const cash = page.getByLabel('Dinheiro na gaveta (R$)');
    await expect(cash).toHaveValue('90,00');
    await page.getByRole('button', { name: 'Fechar caixa' }).click();

    // Não bateu: pede para contar de novo, sem dizer quanto deveria haver
    await expect(
      page.getByRole('alert').filter({ hasText: 'Conte a gaveta de novo' }),
    ).toBeVisible();
    await expect(page.getByText('R$ 100,00 esperado')).toHaveCount(0);
    await page.getByLabel('Dinheiro na gaveta — nova contagem (R$)').fill('100,00');
    await page.getByRole('button', { name: 'Fechar caixa com a nova contagem' }).click();
    await page.waitForURL(/\/caixa\/.+/);
    await expect(page.getByRole('row', { name: /^Dinheiro/ })).toContainText('Confere');
    await expect(page.getByText(/primeira contagem foi informado R\$ 90,00/)).toBeVisible();
  });

  test('desconto acima do limite do caixa pede o PIN do gerente', async ({ page, browser }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    const context = await browser.newContext();
    const waiter = await context.newPage();
    await login(waiter, TEAM.joao.username, TEAM.joao.password);
    await openTable(waiter, number);
    await addItem(waiter, 'Pudim');
    await closeDialog(waiter);
    await sendRound(waiter, 1);
    await context.close();

    await becomeCashier(page);
    await page.goto('/pdv');
    await page
      .getByRole('list', { name: 'Contas a receber' })
      .getByRole('link', { name: new RegExp(`Mesa ${number}`) })
      .click();
    await page.getByRole('button', { name: 'Desconto na conta' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Percentual (%)').fill('20');
    await dialog.getByLabel('Motivo').fill('cliente reclamou');
    // 20% passa dos 10% do caixa: a janela já pede o gerente
    await expect(dialog.getByLabel('Usuário do gerente')).toBeVisible();
    await dialog.getByLabel('Usuário do gerente').fill(TEAM.gerente.username);
    await dialog.getByLabel('PIN do gerente').fill('739104');
    await dialog.getByRole('button', { name: 'Aplicar desconto' }).click();
    await expect(dialog.getByRole('status')).toContainText('Desconto na conta aplicado.');
  });

  test('permissões: o garçom não vê PDV nem caixa', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await page.goto('/pdv');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    await page.goto('/caixa');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
  });

  test('aparelho que não é terminal de caixa: a tela explica', async ({ page }) => {
    await login(page, TEAM.caixa.username, TEAM.caixa.password);
    await page.goto('/caixa');
    await expect(
      page.getByRole('heading', { name: 'Este aparelho não é um terminal de caixa' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
