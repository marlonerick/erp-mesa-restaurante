import { expect, type Page, test } from '@playwright/test';

// Equipe fictícia criada por scripts/seed-dev.ts no banco de E2E.
const TEAM = {
  gerente: { username: 'gerente', password: 'Gerente@2026', name: 'Carla Gerente' },
  caixa: { username: 'caixa', password: 'Caixa@2026', name: 'Bia Caixa' },
  joao: { username: 'joao', password: 'Garcom@2026', name: 'João Garçom', pin: '305917' },
  ana: { username: 'ana', password: 'Garcom@2026', name: 'Ana Garçom' },
};

const unique = (base: string) => `${base}.${Math.random().toString(36).slice(2, 8)}`;

async function submitLogin(page: Page, username: string, password: string, shared = false) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  if (shared) await page.getByLabel('Este aparelho é compartilhado').check();
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Entra e ESPERA o login terminar (como uma pessoa esperaria a tela mudar). */
async function login(page: Page, username: string, password: string, shared = false) {
  await submitLogin(page, username, password, shared);
  await page.waitForURL(/\/(inicio|trocar-senha)$/);
}

/** Toca em "Trocar usuário" e espera chegar na tela de troca. */
async function lockScreen(page: Page) {
  await page.getByRole('button', { name: 'Trocar usuário' }).click();
  await page.waitForURL(/\/quem-esta-usando$/);
}

/** Texto visível no layout atual (tabela no computador, lista no celular). */
const visibleText = (page: Page, text: string) =>
  page.locator('main').getByText(text, { exact: true }).filter({ visible: true });

async function typePin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

test.describe('Entrar e sair', () => {
  test('login leva à tela inicial com a loja e o nome', async ({ page }) => {
    await login(page, TEAM.caixa.username, TEAM.caixa.password);
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { name: 'Olá, Bia.' })).toBeVisible();
    await expect(page.getByText('Você está na loja Centro.')).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('senha errada mostra a mensagem sem revelar o motivo', async ({ page }) => {
    await submitLogin(page, unique('ninguem'), 'qualquer-coisa');
    await expect(page.locator('form [role="alert"]')).toHaveText('Usuário ou senha inválidos.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('o olho mostra e oculta a senha, que volta a ficar oculta ao enviar', async ({ page }) => {
    await page.goto('/login');
    const password = page.getByLabel('Senha', { exact: true });
    await password.fill('qualquer-coisa');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('qualquer-coisa');

    await page.getByRole('button', { name: 'Ocultar senha' }).click();
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await page.getByLabel('Usuário', { exact: true }).fill(unique('ninguem'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('Usuário ou senha inválidos.');
    await expect(password).toHaveAttribute('type', 'password');
  });

  test('telas internas exigem login', async ({ page }) => {
    for (const path of ['/inicio', '/admin/usuarios', '/meu-pin']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
  });
});

test.describe('Usuários e permissões', () => {
  test('gerente cadastra um garçom, que troca a senha provisória no primeiro acesso', async ({
    page,
    browser,
  }) => {
    const username = unique('pedro');
    const name = `Pedro ${username.split('.')[1] ?? ''}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.getByRole('link', { name: 'Usuários' }).first().click();
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByLabel('Usuário de acesso').fill(username);
    await page.getByLabel('Senha provisória').fill('Inicio2026');
    await page.getByRole('checkbox', { name: 'Garçom', exact: true }).check();
    await page.getByRole('button', { name: 'Cadastrar usuário' }).click();
    await expect(page.getByRole('status')).toContainText(`Usuário ${username} criado`);
    await expect(visibleText(page, name)).toBeVisible();

    // O garçom entra em outro aparelho
    const device = await browser.newContext();
    const waiter = await device.newPage();
    await login(waiter, username, 'Inicio2026');
    await expect(waiter).toHaveURL(/\/trocar-senha$/);
    await expect(waiter.getByRole('heading', { name: 'Crie sua senha' })).toBeVisible();
    // Com a senha provisória, nenhuma outra tela abre
    await waiter.goto('/inicio');
    await expect(waiter).toHaveURL(/\/trocar-senha$/);

    await waiter.getByLabel('Senha atual').fill('Inicio2026');
    await waiter.getByLabel('Nova senha', { exact: true }).fill('MinhaSenha#1');
    await waiter.getByLabel('Repita a nova senha').fill('MinhaSenha#1');
    await waiter.getByRole('button', { name: 'Salvar nova senha' }).click();
    await expect(waiter).toHaveURL(/\/inicio$/);
    await device.close();
  });

  test('garçom não acessa a administração de usuários', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
    await page.goto('/admin/usuarios');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
  });

  test('gerente da loja Centro não vê a equipe da loja Praia', async ({ page }) => {
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/admin/usuarios');
    await expect(visibleText(page, 'João Garçom')).toBeVisible();
    await expect(page.getByText('Rui Garçom (Praia)')).toHaveCount(0);
  });
});

test.describe('Aparelho compartilhado do salão', () => {
  test('garçom troca de usuário com o PIN', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password, true);
    await expect(page).toHaveURL(/\/inicio$/);
    await lockScreen(page);
    await login(page, TEAM.ana.username, TEAM.ana.password, true);
    await expect(page.getByRole('heading', { name: 'Olá, Ana.' })).toBeVisible();

    await lockScreen(page);
    await expect(page).toHaveURL(/\/quem-esta-usando$/);
    await page.getByRole('button', { name: /João Garçom/ }).click();
    await typePin(page, TEAM.joao.pin);

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole('heading', { name: 'Olá, João.' })).toBeVisible();
  });

  test('PIN errado avisa e permite tentar de novo', async ({ page }) => {
    await login(page, TEAM.ana.username, TEAM.ana.password, true);
    await lockScreen(page);
    await page.getByRole('button', { name: /Ana Garçom/ }).click();
    await typePin(page, '000001');
    await expect(page.locator('form [role="alert"]')).toHaveText('PIN incorreto.');
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeEnabled();
  });

  test('a tela volta para "Quem está usando?" após 3 minutos sem uso', async ({ page }) => {
    await page.clock.install();
    await login(page, TEAM.ana.username, TEAM.ana.password, true);
    await expect(page).toHaveURL(/\/inicio$/);
    await page.clock.fastForward('03:01');
    await expect(page).toHaveURL(/\/quem-esta-usando$/);
    // A sessão foi encerrada no servidor, não só escondida
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/login$/);
  });
});
