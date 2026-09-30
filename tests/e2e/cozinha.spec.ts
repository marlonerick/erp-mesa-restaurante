import { type Browser, expect, type Page, test } from '@playwright/test';
import {
  addItem,
  closeDialog,
  createTables,
  openTable,
  sendRound,
  tableNumber,
} from './floor-helpers';
import { login, openMenuIfMobile, TEAM } from './helpers';

// Tela da cozinha (Etapa 7). A fila é da loja inteira e os testes rodam em paralelo: cada teste
// usa a PRÓPRIA mesa e procura só o cartão dela ("Mesa E…, rodada 1").

/** O garçom abre a mesa e envia a rodada em outro aparelho; a página dele fica aberta. */
async function waiterSends(
  browser: Browser,
  number: string,
  items: readonly { product: string; notes?: string }[],
): Promise<Page> {
  const context = await browser.newContext();
  const waiter = await context.newPage();
  await login(waiter, TEAM.joao.username, TEAM.joao.password);
  await openTable(waiter, number);
  for (const item of items) await addItem(waiter, item.product, [], item.notes);
  await closeDialog(waiter);
  await sendRound(waiter, items.length);
  return waiter;
}

const card = (page: Page, number: string) =>
  page.getByRole('article', { name: `Mesa ${number}, rodada 1`, exact: true });

async function openKitchen(page: Page) {
  await login(page, TEAM.cozinha.username, TEAM.cozinha.password);
  await page.goto('/cozinha');
  await expect(page.getByRole('heading', { name: 'Cozinha', level: 1 })).toBeVisible();
}

test.describe('Tela da cozinha (Etapa 7)', () => {
  // Três aparelhos por teste (gerente, garçom, cozinha) + a espera da leitura automática do garçom
  test.describe.configure({ timeout: 60_000 });

  test('a cozinha inicia e termina o item; o garçom vê "Pronto"; desfazer devolve à fila', async ({
    page,
    browser,
  }) => {
    const number = tableNumber();
    await createTables(browser, [number]);
    const waiter = await waiterSends(browser, number, [
      { product: 'X-Salada', notes: 'sem cebola' },
    ]);
    await openKitchen(page);

    const ticket = card(page, number);
    await expect(ticket).toContainText('1 × X-Salada');
    await expect(ticket).toContainText('Obs.: sem cebola');
    await expect(ticket).toContainText('A fazer');
    await expect(ticket).toContainText('No prazo');
    await expect(ticket).toContainText('João Garçom');

    await ticket.getByRole('button', { name: `Iniciar X-Salada (Mesa ${number})` }).click();
    await expect(ticket).toContainText('Preparando');
    await ticket.getByRole('button', { name: `Pronto X-Salada (Mesa ${number})` }).click();
    // Único item pronto: o pedido sai da fila e vai para "Prontos há pouco"
    await expect(ticket).toHaveCount(0);
    const recent = page.getByRole('article', { name: `Mesa ${number} pronto`, exact: true });
    await expect(recent).toContainText('1 × X-Salada');

    // O celular do garçom se atualiza sozinho (5 s) e mostra o botão de entregar
    await expect(waiter.getByRole('list', { name: 'Rodada 1' })).toContainText('Pronto', {
      timeout: 15_000,
    });
    await expect(waiter.getByRole('button', { name: 'Entregar X-Salada' })).toBeVisible();

    // Pronto por engano: volta para a fila como "Preparando"
    await recent.getByRole('button', { name: `Desfazer pronto X-Salada (Mesa ${number})` }).click();
    await expect(ticket).toContainText('Preparando');
    await ticket.getByRole('button', { name: `Tudo pronto Mesa ${number}` }).click();
    await expect(ticket).toHaveCount(0);
    await waiter.context().close();
  });

  test('"Tudo pronto" e a via da cozinha em 80 mm', async ({ page, browser }) => {
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
    const waiter = await waiterSends(browser, number, [
      { product: 'Parmegiana', notes: 'bem passada' },
      { product: 'Pudim' },
    ]);
    await waiter.context().close();
    await openKitchen(page);

    const ticket = card(page, number);
    await ticket.getByRole('button', { name: `Imprimir Mesa ${number}` }).click();
    const slip = page.getByTestId('via-da-cozinha');
    await expect(slip).toContainText(`Mesa ${number}`);
    await expect(slip).toContainText('1 × Parmegiana');
    await expect(slip).toContainText('OBS: BEM PASSADA');
    await expect(slip).not.toContainText('R$');
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    // Na impressão, só a via aparece
    await page.emulateMedia({ media: 'print' });
    await expect(slip).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cozinha', level: 1 })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    // A via continua montada (invisível): o Android não espera a impressão (achado I-1). Imprimir de
    // novo o mesmo pedido chama a impressão outra vez
    await expect(slip).toBeHidden();
    await ticket.getByRole('button', { name: `Imprimir Mesa ${number}` }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
      .toBe(2);

    await ticket.getByRole('button', { name: `Tudo pronto Mesa ${number}` }).click();
    await expect(ticket).toHaveCount(0);
    const recent = page.getByRole('article', { name: `Mesa ${number} pronto`, exact: true });
    await expect(recent).toContainText('1 × Parmegiana');
    await expect(recent).toContainText('1 × Pudim');
  });

  test('som e menu: "Ativar som" liga o aviso; a cozinha acha a tela no menu', async ({ page }) => {
    await login(page, TEAM.cozinha.username, TEAM.cozinha.password);
    await openMenuIfMobile(page);
    await page.getByRole('link', { name: 'Cozinha' }).click();
    await page.waitForURL(/\/cozinha$/);
    const sound = page.getByRole('button', { name: 'Ativar som' });
    await sound.click();
    await expect(page.getByRole('button', { name: 'Som ligado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('permissões: o garçom acompanha sem botões; o caixa não vê a cozinha', async ({
    page,
    browser,
  }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await page.goto('/cozinha');
    await expect(page.getByRole('heading', { name: 'Cozinha', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^(Iniciar|Pronto|Tudo pronto|Imprimir) / }),
    ).toHaveCount(0);

    const context = await browser.newContext();
    const cashier = await context.newPage();
    await login(cashier, TEAM.caixa.username, TEAM.caixa.password);
    await cashier.goto('/cozinha');
    await expect(cashier.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    expect((await cashier.request.get('/api/cozinha')).status()).toBe(403);

    // A tela mostrava outra loja (trocada em outra aba): a leitura automática recusa (achado I-4)
    const changed = await page.request.get('/api/cozinha?loja=outra-loja');
    expect(changed.status()).toBe(409);
    expect(await changed.json()).toMatchObject({ code: 'STORE_CHANGED' });
    expect((await page.request.get('/api/salao?loja=outra-loja')).status()).toBe(409);
    await context.close();
  });

  test('a tela da cozinha cabe na largura do aparelho', async ({ page }) => {
    await openKitchen(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
