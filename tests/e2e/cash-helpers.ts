import { expect, type Page } from '@playwright/test';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

// Apoio do caixa (Etapas 8 e 10): cada teste vincula um terminal PRÓPRIO a este navegador.

/** O gerente cadastra um terminal de caixa e vincula ESTE navegador; depois entra o caixa. */
export async function becomeCashier(page: Page) {
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

export async function openCash(page: Page, amount: string) {
  await page.goto('/caixa');
  await page.getByLabel('Fundo de troco (R$)').fill(amount);
  await page.getByRole('button', { name: 'Abrir caixa' }).click();
  await expect(page.getByRole('heading', { name: 'Caixa aberto' })).toBeVisible();
}
