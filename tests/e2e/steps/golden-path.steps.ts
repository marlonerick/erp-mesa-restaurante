import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { addItem, closeDialog, sendRound, tableNumber } from '../floor-helpers';
import { login, openMenuIfMobile, TEAM, unique } from '../helpers';

// Golden path (README B.11) no navegador, como no piloto: cada pessoa no PRÓPRIO aparelho
// (contexto do navegador). Tudo é cadastrado pelas telas, numa loja nova, sem tocar no banco.

const { Given, When, Then } = createBdd();

/** Estado do cenário (um cenário por vez neste arquivo). */
const pilot = {
  code: '',
  store: '',
  table: '',
  product: '',
  ingredient: '',
  terminal: '',
  people: {} as Record<'gerente' | 'caixa' | 'garcom' | 'cozinha', string>,
  devices: [] as BrowserContext[],
  pages: {} as Record<string, Page>,
};

const PROVISIONAL = 'Inicio2026';
const PASSWORD = 'Piloto#2026';
const STEP_TIMEOUT = { timeout: 15_000 };

/** Novo aparelho (contexto do navegador), com a impressão trocada por um contador. */
async function device(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const counter = window as unknown as { printed: number };
    counter.printed = 0;
    window.print = () => {
      counter.printed += 1;
    };
  });
  pilot.devices.push(context);
  const page = await context.newPage();
  pilot.pages[name] = page;
  return page;
}

/** Primeiro acesso: entra com a senha provisória e cria a própria senha. */
async function firstLogin(page: Page, username: string) {
  await login(page, username, PROVISIONAL);
  await expect(page).toHaveURL(/\/trocar-senha$/);
  await page.getByLabel('Senha atual').fill(PROVISIONAL);
  await page.getByLabel('Nova senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repita a nova senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText(`Você está na loja ${pilot.store}`)).toBeVisible();
}

async function createUser(page: Page, role: string, base: string) {
  const username = unique(base);
  await page.goto('/admin/usuarios');
  await page.getByLabel('Nome', { exact: true }).fill(`${role} do piloto`);
  await page.getByLabel('Usuário de acesso').fill(username);
  await page.getByLabel('Senha provisória').fill(PROVISIONAL);
  await page.getByRole('checkbox', { name: role, exact: true }).check();
  await page.getByRole('button', { name: 'Cadastrar usuário' }).click();
  await expect(page.getByRole('status')).toContainText(`Usuário ${username} criado`);
  return username;
}

const at = (name: string) => {
  const page = pilot.pages[name];
  if (!page) throw new Error(`o aparelho "${name}" não existe no cenário`);
  return page;
};
const admin = () => at('admin');

Given(
  'que o administrador cadastrou a loja do piloto com taxa de serviço de {string} %',
  async ({ browser, $testInfo }, fee: string) => {
    // Cinco aparelhos e o dia inteiro num cenário só
    $testInfo.setTimeout(240_000);
    for (const context of pilot.devices.splice(0)) await context.close();
    pilot.code = unique('PIL').replace('.', '-').toUpperCase().slice(0, 12);
    pilot.store = `Piloto ${pilot.code}`;
    const page = await device(browser, 'admin');
    await login(page, TEAM.admin.username, TEAM.admin.password);
    await page.goto('/admin/lojas');
    await page.getByLabel('Nome', { exact: true }).fill(pilot.store);
    await page.getByLabel('Código', { exact: true }).fill(pilot.code);
    await page.getByRole('button', { name: 'Cadastrar loja' }).click();
    await expect(page.getByRole('heading', { name: pilot.store })).toBeVisible(STEP_TIMEOUT);
    await page.getByLabel('Taxa de serviço (%)').fill(fee);
    await page.getByRole('button', { name: 'Salvar loja' }).click();
    await expect(page.getByRole('status')).toHaveText('Loja salva.');

    // Passa a trabalhar na loja nova (troca em 1 clique — RN-ORG-12)
    await openMenuIfMobile(page);
    await page.locator('summary').filter({ visible: true }).click();
    await page.getByRole('button', { name: pilot.store, exact: true }).click();
    await expect(page.getByText(`Você está na loja ${pilot.store}.`)).toBeVisible(STEP_TIMEOUT);
  },
);

Given('cadastrou o terminal de caixa e a equipe: gerente, caixa, garçom e cozinha', async () => {
  const page = admin();
  pilot.terminal = `Caixa ${pilot.code}`;
  await page.goto('/admin/terminais');
  await page.getByLabel('Código', { exact: true }).fill(`CX-${pilot.code}`.slice(0, 20));
  await page.getByLabel('Nome', { exact: true }).fill(pilot.terminal);
  await page.getByRole('button', { name: 'Cadastrar terminal' }).click();
  await expect(page.getByRole('status')).toHaveText('Terminal cadastrado.');

  pilot.people = {
    gerente: await createUser(page, 'Gerente', 'ger'),
    caixa: await createUser(page, 'Caixa', 'cx'),
    garcom: await createUser(page, 'Garçom', 'gar'),
    cozinha: await createUser(page, 'Cozinha', 'coz'),
  };
});

Given(
  'cadastrou o insumo {string} e lançou a compra de {string} kg por {string}',
  async ({}, name: string, kilos: string, paid: string) => {
    const page = admin();
    pilot.ingredient = `${name} ${pilot.code}`;
    await page.goto('/estoque');
    await page.getByLabel('Nome', { exact: true }).fill(pilot.ingredient);
    await page.getByLabel('Unidade de controle').selectOption('g');
    await page.getByRole('button', { name: 'Cadastrar insumo' }).click();
    await expect(page.getByRole('heading', { name: pilot.ingredient, level: 1 })).toBeVisible(
      STEP_TIMEOUT,
    );
    await page.getByText('Entrada (compra)').click();
    await page.getByLabel('Quantidade comprada').fill(kilos);
    await page.getByLabel('Unidade').first().selectOption('kg');
    await page.getByLabel('Valor total pago (R$)').fill(paid);
    await page.getByRole('button', { name: 'Lançar entrada' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Entrada lançada.' })).toBeVisible();
  },
);

Given(
  'cadastrou o produto {string} por {string} com ficha técnica de {string} g de {string}',
  async ({}, name: string, price: string, grams: string, ingredient: string) => {
    expect(pilot.ingredient.startsWith(ingredient)).toBe(true);
    const page = admin();
    pilot.product = `${name} ${pilot.code}`;
    await page.goto('/catalogo/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill(pilot.product);
    await page.getByLabel('Categoria').selectOption({ label: 'Lanches' });
    await page.getByLabel(`Preço na loja ${pilot.store} (R$)`).fill(price);
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByRole('heading', { name: pilot.product, level: 1 })).toBeVisible(
      STEP_TIMEOUT,
    );

    await page.goto('/fichas-tecnicas');
    await page.getByRole('link', { name: new RegExp(pilot.product) }).click();
    await page
      .getByLabel('Insumo 1', { exact: true })
      .selectOption({ label: `${pilot.ingredient} (g)` });
    await page.getByLabel(/^Quantidade/).fill(grams);
    await page.getByRole('button', { name: 'Salvar ficha técnica' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Ficha técnica salva.' }),
    ).toBeVisible();
  },
);

Given('cadastrou a mesa do piloto', async () => {
  const page = admin();
  pilot.table = tableNumber();
  await page.goto('/mesas');
  await page.getByLabel('Número', { exact: true }).fill(pilot.table);
  await page.getByLabel('Área (opcional)').fill('Salão do piloto');
  await page.getByRole('button', { name: 'Cadastrar mesa' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mesa cadastrada.' })).toBeVisible();
});

When(
  'o caixa abre o caixa com {string} de fundo de troco',
  async ({ browser }, opening: string) => {
    // O gerente vincula o computador do caixa ao terminal (no próprio aparelho) e sai
    const page = await device(browser, 'caixa');
    await firstLogin(page, pilot.people.gerente);
    await page.goto('/admin/terminais');
    await page.getByRole('link', { name: new RegExp(pilot.terminal) }).click();
    await page.getByRole('button', { name: `Usar este aparelho como ${pilot.terminal}` }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Pronto: este aparelho agora é este terminal.',
    );
    await openMenuIfMobile(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await firstLogin(page, pilot.people.caixa);
    await page.goto('/caixa');
    await page.getByLabel('Fundo de troco (R$)').fill(opening);
    await page.getByRole('button', { name: 'Abrir caixa' }).click();
    await expect(page.getByRole('heading', { name: 'Caixa aberto' })).toBeVisible(STEP_TIMEOUT);
  },
);

When(
  'o garçom abre a mesa, lança {int} {string} e envia para a cozinha',
  async ({ browser }, quantity: number, product: string) => {
    expect(pilot.product.startsWith(product)).toBe(true);
    const page = await device(browser, 'garcom');
    await firstLogin(page, pilot.people.garcom);
    await page.goto('/salao');
    await page.getByRole('button', { name: new RegExp(`^Mesa ${pilot.table}\\b`) }).click();
    await page.getByLabel('Pessoas (opcional)').fill('2');
    await page.getByRole('button', { name: 'Abrir mesa' }).click();
    await page.waitForURL(/\/salao\/comanda\/.+/);
    for (let index = 0; index < quantity; index += 1) await addItem(page, pilot.product);
    await closeDialog(page);
    await sendRound(page, quantity);
  },
);

When('a cozinha marca o pedido como pronto', async ({ browser }) => {
  const page = await device(browser, 'cozinha');
  await firstLogin(page, pilot.people.cozinha);
  await page.goto('/cozinha');
  const ticket = page.getByRole('article', {
    name: `Mesa ${pilot.table}, rodada 1`,
    exact: true,
  });
  await expect(ticket).toContainText(pilot.product, STEP_TIMEOUT);
  await ticket.getByRole('button', { name: `Tudo pronto Mesa ${pilot.table}` }).click();
  await expect(ticket).toHaveCount(0);
});

When('o garçom entrega os itens e pede a conta', async () => {
  const page = at('garcom');
  // O celular se atualiza sozinho (5 s) e mostra os botões de entregar
  const deliver = page.getByRole('button', { name: `Entregar ${pilot.product}` });
  await expect(deliver.first()).toBeVisible({ timeout: 20_000 });
  while ((await deliver.count()) > 0) {
    const before = await deliver.count();
    await deliver.first().click();
    await expect(deliver).toHaveCount(before - 1, STEP_TIMEOUT);
  }
  await page.getByRole('button', { name: 'Pedir a conta' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Conta pedida' })).toBeVisible();
});

When('o caixa emite a pré-conta de {string}', async ({}, total: string) => {
  const page = at('caixa');
  await page.goto('/pdv');
  await page
    .getByRole('list', { name: 'Contas a receber' })
    .getByRole('link', { name: new RegExp(`Mesa ${pilot.table}`) })
    .click();
  await expect(page.getByRole('heading', { name: `Mesa ${pilot.table}`, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Emitir pré-conta' }).click();
  await expect(page.getByTestId('pre-conta')).toContainText(`TOTAL: R$ ${total}`);
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

When(
  'o caixa recebe {string} no PIX e {string} em dinheiro, com troco de {string}',
  async ({}, pix: string, cash: string, change: string) => {
    const page = at('caixa');
    const receive = page.getByRole('button', { name: 'Receber', exact: true });
    await page.getByLabel('Valor (R$)').fill(pix);
    await page.getByLabel(/Confirmei que o pagamento foi aprovado/).check();
    await receive.click();
    await expect(page.getByRole('status').filter({ hasText: `Recebido R$ ${pix}.` })).toBeVisible();
    await page
      .locator('label')
      .filter({ hasText: /^Dinheiro$/ })
      .click();
    await page.getByLabel('Valor recebido (R$)').fill(cash);
    await receive.click();
    await expect(
      page.getByRole('status').filter({ hasText: `Troco: R$ ${change}. Conta paga e fechada.` }),
    ).toBeVisible();
  },
);

When(
  'o caixa fecha o caixa informando {string} em dinheiro e {string} no PIX',
  async ({}, cash: string, pix: string) => {
    const page = at('caixa');
    await page.goto('/caixa');
    // PIX aparece para conferir com a maquininha (E10-6 B); o dinheiro, não
    await expect(page.getByText(`No sistema: R$ ${pix}`)).toBeVisible();
    await page.getByLabel('Dinheiro na gaveta (R$)').fill(cash);
    await page.getByLabel('PIX (R$)').fill(pix);
    await page.getByRole('button', { name: 'Fechar caixa' }).click();
    await page.waitForURL(/\/caixa\/.+/);
  },
);

Then('o fechamento confere em dinheiro e no PIX', async () => {
  const page = at('caixa');
  await expect(page.getByRole('row', { name: /^Dinheiro/ })).toContainText('Confere');
  await expect(page.getByRole('row', { name: /^PIX/ })).toContainText('Confere');
});

Then('o estoque de {string} baixou para {string}', async ({}, _name: string, balance: string) => {
  const page = admin();
  await page.goto(`/estoque?busca=${encodeURIComponent(pilot.ingredient)}`);
  await expect(page.getByRole('link', { name: new RegExp(pilot.ingredient) })).toContainText(
    balance,
  );
});

Then(
  'o gerente vê no relatório vendas de {string} e no financeiro as receitas do caixa',
  async ({ browser }, total: string) => {
    const page = await device(browser, 'gerente');
    await login(page, pilot.people.gerente, PASSWORD);
    await page.goto('/relatorios');
    await expect(page.getByText(`R$ ${total}`).first()).toBeVisible();
    await page.goto('/financeiro');
    const sales = page.getByRole('listitem').filter({ hasText: 'Vendas do caixa de' });
    await expect(sales).toHaveCount(2);
    await expect(sales.filter({ hasText: 'PIX' })).toContainText('R$ 40,00');
    // Dinheiro: 30,00 recebidos − 4,00 de troco
    await expect(sales.filter({ hasText: 'Dinheiro' })).toContainText('R$ 26,00');
    for (const context of pilot.devices.splice(0)) await context.close();
  },
);
