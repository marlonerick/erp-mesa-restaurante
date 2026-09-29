import { expect, test } from '@playwright/test';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

test.describe('Estoque (Etapa 5)', () => {
  test('gerente cadastra insumo, lança compra em kg e faz a contagem', async ({ page }) => {
    const name = `Farinha ${unique('e2e')}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/estoque');
    await page.getByLabel('Nome', { exact: true }).fill(name);
    await page.getByLabel('Unidade de controle').selectOption('g');
    await page.getByRole('button', { name: 'Cadastrar insumo' }).click();
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

    // Compra: 2 kg por R$ 80,00 → saldo 2 kg, custo R$ 40,00/kg
    await page.getByText('Entrada (compra)').click();
    await page.getByLabel('Quantidade comprada').fill('2');
    await page.getByLabel('Unidade').first().selectOption('kg');
    await page.getByLabel('Valor total pago (R$)').fill('80,00');
    await page.getByRole('button', { name: 'Lançar entrada' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Entrada lançada.' })).toBeVisible();
    await expect(page.getByText('2 kg', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('R$ 40,00/kg')).toBeVisible();

    // Contagem: contou 1,5 kg → o sistema lança a diferença
    await page.getByText('Contagem', { exact: true }).click();
    await page.getByLabel('Quantidade contada').fill('1,5');
    await page.getByLabel('Unidade').nth(1).selectOption('kg');
    await page.getByRole('button', { name: 'Registrar contagem' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Contagem registrada: saldo ajustado.' }),
    ).toBeVisible();
    const extrato = page.getByRole('list', { name: 'Movimentações, da mais nova' });
    await expect(extrato.getByRole('listitem').first()).toContainText('Contagem');
    await expect(extrato.getByRole('listitem').first()).toContainText('-500 g');

    // Regressão: salvar o mínimo de novo SEM MEXER mantém 1 kg (o campo não pode vir "1.000")
    await page.getByLabel('Estoque mínimo (g)').fill('1000');
    await page.getByRole('button', { name: 'Salvar mínimo' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Estoque mínimo salvo.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Estoque mínimo (g)')).toHaveValue('1000');
    await page.getByRole('button', { name: 'Salvar mínimo' }).click();
    await page.reload();
    await expect(page.getByLabel('Estoque mínimo (g)')).toHaveValue('1000');
  });

  test('gerente monta a ficha técnica de um produto novo', async ({ page }) => {
    const product = `Bolo ${unique('e2e')}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/catalogo/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill(product);
    await page.getByLabel('Categoria').selectOption({ label: 'Sobremesas' });
    await page.getByLabel('Preço na loja Centro (R$)').fill('20');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByRole('heading', { name: product, level: 1 })).toBeVisible();

    await page.goto('/fichas-tecnicas');
    await page.getByRole('link', { name: new RegExp(product) }).click();
    await expect(page.getByText('Sem ficha').first()).toBeVisible();
    await page
      .getByLabel('Insumo 1', { exact: true })
      .selectOption({ label: 'Leite condensado (g)' });
    await page.getByLabel(/^Quantidade/).fill('100');
    await page.getByRole('button', { name: 'Adicionar insumo' }).click();
    await page.getByLabel('Insumo 2', { exact: true }).selectOption({ label: 'Ovo (un)' });
    await page
      .getByLabel(/^Quantidade/)
      .nth(1)
      .fill('2');
    await page.getByRole('button', { name: 'Salvar ficha técnica' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Ficha técnica salva.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alterar ficha' })).toBeVisible();
    await expect(page.getByText('Margem')).toBeVisible();
  });

  test('conflito na ficha: a segunda tela recebe o aviso e passa a mostrar o que foi gravado (achado I-2)', async ({
    page,
    browser,
  }) => {
    const product = `Torta ${unique('e2e')}`;
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/catalogo/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill(product);
    await page.getByLabel('Categoria').selectOption({ label: 'Sobremesas' });
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByRole('heading', { name: product, level: 1 })).toBeVisible();
    await page.goto('/fichas-tecnicas');
    await page.getByRole('link', { name: new RegExp(product) }).click();
    await page.waitForURL(/\/fichas-tecnicas\/produto\/.+/);
    const url = page.url();

    // Segunda tela (outro aparelho) abre a mesma ficha, ainda vazia
    const other = await browser.newContext();
    const second = await other.newPage();
    await login(second, TEAM.gerente.username, TEAM.gerente.password);
    await second.goto(url);

    // A primeira salva
    await page
      .getByLabel('Insumo 1', { exact: true })
      .selectOption({ label: 'Leite condensado (g)' });
    await page.getByLabel(/^Quantidade/).fill('100');
    await page.getByRole('button', { name: 'Salvar ficha técnica' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Ficha técnica salva.' }),
    ).toBeVisible();

    // A segunda tenta salvar outra coisa: aviso, e a tela passa a mostrar a ficha gravada
    await second.getByLabel('Insumo 1', { exact: true }).selectOption({ label: 'Ovo (un)' });
    await second.getByLabel(/^Quantidade/).fill('3');
    await second.getByRole('button', { name: 'Salvar ficha técnica' }).click();
    await expect(second.locator('form [role="alert"]')).toContainText('Outra pessoa alterou');
    await expect(
      second.getByLabel('Insumo 1', { exact: true }).locator('option:checked'),
    ).toHaveText('Leite condensado (g)');
    await expect(second.getByLabel(/^Quantidade/)).toHaveValue('100');

    // Segundo clique NÃO apaga a alteração da outra pessoa
    await second.getByRole('button', { name: 'Salvar ficha técnica' }).click();
    // Espera o servidor responder antes de conferir (S-9 da reverificação)
    await expect(
      second.getByRole('status').filter({ hasText: 'Ficha técnica salva.' }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('Leite condensado').first()).toBeVisible();
    await expect(page.getByText('Ovo ·')).toHaveCount(0);
    await other.close();
  });

  test('cozinha consulta o estoque e as fichas, mas não lança', async ({ page }) => {
    await login(page, 'cozinha', 'Cozinha@2026');
    await openMenuIfMobile(page);
    await expect(page.getByRole('link', { name: 'Estoque' })).toBeVisible();
    await page.goto('/estoque');
    await expect(page.getByRole('heading', { name: 'Estoque', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar insumo' })).toHaveCount(0);
    await page.getByRole('link', { name: /Carne moída/ }).click();
    await expect(page.getByRole('heading', { name: 'Extrato' })).toBeVisible();
    await expect(page.getByText('Entrada (compra)')).toHaveCount(0);
    await page.goto('/fichas-tecnicas');
    await page.getByRole('link', { name: /X-Burger/ }).click();
    await expect(page.getByRole('button', { name: 'Salvar ficha técnica' })).toHaveCount(0);
  });

  test('garçom não vê estoque nem fichas', async ({ page }) => {
    await login(page, TEAM.joao.username, TEAM.joao.password);
    for (const path of ['/estoque', '/fichas-tecnicas']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Sem permissão' }), path).toBeVisible();
    }
  });

  test('as telas de estoque cabem na largura do aparelho', async ({ page }) => {
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/estoque');
    await page.getByRole('link', { name: /Carne moída/ }).click();
    await page.waitForURL(/\/estoque\/.+/);
    for (const summary of await page.locator('summary').all()) await summary.click();
    const pages = [page.url(), '/estoque', '/fichas-tecnicas'];
    await page.goto('/fichas-tecnicas');
    await page
      .getByRole('link', { name: /X-Burger/ })
      .first()
      .click();
    await page.waitForURL(/\/fichas-tecnicas\/produto\/.+/);
    pages.push(page.url());
    for (const path of pages) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
