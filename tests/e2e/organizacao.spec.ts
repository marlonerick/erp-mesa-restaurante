import { expect, test } from '@playwright/test';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

test.describe('Lojas e configurações (Etapa 3)', () => {
  test('admin cadastra uma loja e altera a taxa de serviço', async ({ page }) => {
    const code = unique('LJ').replace('.', '-').toUpperCase();
    const name = `Loja ${code}`;
    await login(page, TEAM.admin.username, TEAM.admin.password);
    await page.goto('/admin/lojas');
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByLabel('Código', { exact: true }).fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Cadastrar loja' }).click();

    // Cadastrou: abre a loja nova, com o código em maiúsculas e as configurações padrão
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(`Código ${code} · Ativa`)).toBeVisible();
    await expect(page.getByLabel('Taxa de serviço (%)')).toHaveValue('10');
    await expect(page.getByLabel('Virada do dia de trabalho')).toHaveValue('05:00');

    await page.getByLabel('Taxa de serviço (%)').fill('12,5');
    await page.getByRole('button', { name: 'Salvar loja' }).click();
    await expect(page.getByRole('status')).toHaveText('Loja salva.');
    await page.reload();
    await expect(page.getByLabel('Taxa de serviço (%)')).toHaveValue('12,5');
  });

  test('taxa inválida mostra o erro e mantém o que foi digitado', async ({ page }) => {
    await login(page, TEAM.admin.username, TEAM.admin.password);
    await page.goto('/admin/lojas');
    await page.getByLabel('Nome', { exact: true }).fill('Loja com erro');
    await page.getByLabel('Código', { exact: true }).fill(unique('ERR').replace('.', '-'));
    await page.getByLabel('Taxa de serviço (%)').fill('150');
    await page.getByRole('button', { name: 'Cadastrar loja' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      'A taxa de serviço deve ficar entre 0% e 100%, com até 2 casas decimais.',
    );
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Loja com erro');
  });

  test('gerente e garçom não veem as telas de empresa e lojas', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openMenuIfMobile(page);
    await expect(page.getByRole('link', { name: 'Lojas' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Terminais' })).toHaveCount(0);
    for (const path of ['/admin/lojas', '/admin/empresa', '/admin/terminais']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Sem permissão' }), path).toBeVisible();
    }
  });
});

test.describe('Troca de loja em 1 clique (Etapa 3)', () => {
  test('admin troca da loja Centro para a Praia pelo menu', async ({ page }) => {
    await login(page, TEAM.admin.username, TEAM.admin.password);
    await expect(page.getByText('Você está na loja Centro.')).toBeVisible();
    await openMenuIfMobile(page);
    await page.locator('summary').filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Praia', exact: true }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByText('Você está na loja Praia.')).toBeVisible();
  });
});

test.describe('Terminais (Etapa 3)', () => {
  test('gerente registra este aparelho como terminal do caixa', async ({ page }) => {
    const code = unique('CX').replace('.', '-').toUpperCase().slice(0, 20);
    const name = `Caixa ${code}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/admin/terminais');
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Cadastrar terminal' }).click();
    await expect(page.getByRole('status')).toHaveText('Terminal cadastrado.');

    await page.getByRole('link', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: `Usar este aparelho como ${name}` }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Pronto: este aparelho agora é este terminal.',
    );
    await expect(page.getByText(`Este aparelho é o terminal ${name}.`)).toBeVisible();

    await page.goto('/inicio');
    await expect(page.getByText(`Você está na loja Centro, no terminal ${name}.`)).toBeVisible();
  });
});

test.describe('Menu lateral (Etapa 3)', () => {
  test('no computador o menu recolhe e continua recolhido depois de recarregar', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'recolher é do menu fixo do computador');
    await login(page, TEAM.admin.username, TEAM.admin.password);
    const menu = page.getByRole('complementary', { name: 'Menu lateral' });
    await expect(menu).toHaveAttribute('data-mode', 'auto');
    await page.getByRole('button', { name: 'Recolher menu' }).click();
    await expect(menu).toHaveAttribute('data-mode', 'collapsed');
    await page.reload();
    await expect(menu).toHaveAttribute('data-mode', 'collapsed');
    // Recolhido, os itens continuam com nome para o leitor de tela
    await expect(menu.getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('no celular o menu abre como gaveta e fecha com Esc', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'celular', 'gaveta é do celular');
    await login(page, TEAM.admin.username, TEAM.admin.password);
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await drawer.getByRole('link', { name: 'Lojas' }).click();
    await expect(page).toHaveURL(/\/admin\/lojas$/);
    await expect(drawer).toBeHidden();
  });
});
