import { expect, test } from '@playwright/test';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

test.describe('Cardápio (Etapa 4)', () => {
  test('gerente cadastra produto com preço e a cozinha marca que acabou', async ({
    page,
    browser,
  }) => {
    const name = `Bolo ${unique('e2e')}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/catalogo/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByLabel('Categoria').selectOption({ label: 'Sobremesas' });
    await page.getByLabel('Preço na loja Centro (R$)').fill('19,9');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();

    // Cadastrou: abre o produto, com o preço formatado
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
    await expect(page.getByLabel('Preço na loja Centro (R$)')).toHaveValue('19,90');

    // A cozinha, em outro aparelho, marca que acabou
    const kitchen = await browser.newContext();
    const kitchenPage = await kitchen.newPage();
    await login(kitchenPage, 'cozinha', 'Cozinha@2026');
    await kitchenPage.goto('/disponibilidade');
    await kitchenPage.getByRole('button', { name: `Acabou: ${name}` }).click();
    // Só a linha DESTE produto (os outros aparelhos do teste rodam ao mesmo tempo)
    const row = kitchenPage.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText('Esgotado · R$ 19,90');
    await expect(row.getByRole('button', { name: `Voltou: ${name}` })).toBeVisible();
    await kitchen.close();

    // A lista de produtos do gerente mostra o esgotado
    await page.goto(`/catalogo/produtos?busca=${encodeURIComponent(name)}`);
    await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('Esgotado');
  });

  test('preço inválido mostra o erro e mantém o que foi digitado', async ({ page }) => {
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/catalogo/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill('Produto com erro');
    await page.getByLabel('Categoria').selectOption({ label: 'Lanches' });
    await page.getByLabel('Preço na loja Centro (R$)').fill('12,345');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      'Informe um valor entre R$ 0,00 e R$ 99.999,99 (ex.: 32,50).',
    );
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Produto com erro');
  });

  test('gerente cadastra categoria e grupo de adicionais com opção', async ({ page }) => {
    const suffix = unique('e2e');
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/catalogo/categorias');
    await page.getByLabel('Nome', { exact: true }).fill(`Porções ${suffix}`);
    await page.getByRole('button', { name: 'Cadastrar categoria' }).click();
    await expect(page.getByRole('status')).toHaveText('Categoria cadastrada.');
    await expect(page.getByRole('link', { name: new RegExp(`Porções ${suffix}`) })).toBeVisible();

    await page.goto('/catalogo/adicionais');
    await page.getByLabel('Nome do grupo').fill(`Molhos ${suffix}`);
    await page.getByLabel('Máximo de escolhas').fill('2');
    await page.getByRole('button', { name: 'Cadastrar grupo' }).click();
    // Cadastrou: abre o grupo, que avisa que ainda não tem opções
    await expect(page.getByRole('heading', { name: `Molhos ${suffix}`, level: 1 })).toBeVisible();
    await page.getByLabel('Nome da opção').fill('Barbecue');
    await page.getByLabel('Preço extra (R$)').fill('2');
    await page.getByRole('button', { name: 'Incluir opção' }).click();
    await expect(page.getByRole('status')).toHaveText('Opção incluída.');
    await expect(page.getByRole('form', { name: 'Opção Barbecue' })).toBeVisible();
  });

  test('as telas do cardápio cabem na largura do aparelho (sem rolagem lateral)', async ({
    page,
  }) => {
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    for (const path of [
      '/catalogo/produtos',
      '/catalogo/produtos/novo',
      '/catalogo/categorias',
      '/catalogo/adicionais',
      '/disponibilidade',
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('garçom não vê o cadastro do cardápio nem a disponibilidade', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    await openMenuIfMobile(page);
    await expect(page.getByRole('link', { name: 'Produtos' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Disponibilidade' })).toHaveCount(0);
    for (const path of ['/catalogo/produtos', '/catalogo/categorias', '/disponibilidade']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Sem permissão' }), path).toBeVisible();
    }
  });
});
