import { type Browser, expect, type Page } from '@playwright/test';
import { login, TEAM } from './helpers';

// Apoio do salão (Etapas 6 e 7). Cada teste cadastra as PRÓPRIAS mesas (número único): os três
// aparelhos rodam ao mesmo tempo no mesmo banco de E2E.

/** Número de mesa único (até 10 letras/números — RN-TAB-02). */
export const tableNumber = () => `E${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** O gerente cadastra as mesas numa sessão separada (outro aparelho). */
export async function createTables(browser: Browser, numbers: readonly string[]) {
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

export async function openTable(page: Page, number: string) {
  await page.goto('/salao');
  await page.getByRole('button', { name: new RegExp(`^Mesa ${number}\\b`) }).click();
  await page.getByLabel('Pessoas (opcional)').fill('2');
  await page.getByRole('button', { name: 'Abrir mesa' }).click();
  await page.waitForURL(/\/salao\/comanda\/.+/);
  await expect(page.getByRole('heading', { name: `Mesa ${number}`, level: 1 })).toBeVisible();
}

export async function addItem(
  page: Page,
  product: string,
  choose: readonly string[] = [],
  notes?: string,
) {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) {
    await page.getByRole('button', { name: 'Adicionar item' }).click();
  }
  await dialog.getByLabel('Buscar produto').fill(product);
  await dialog.getByRole('button', { name: new RegExp(`^${product}`) }).click();
  for (const option of choose) await dialog.getByLabel(option).check();
  if (notes) await dialog.getByLabel('Observação (opcional)').fill(notes);
  await dialog.getByRole('button', { name: 'Lançar na conta' }).click();
  await expect(dialog.getByRole('status')).toContainText('Item lançado');
}

export async function closeDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar janela' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Envia a rodada com `count` itens. Espera a comanda mostrar TODOS os itens lançados antes de
 * tocar: o envio manda exatamente o que a tela mostra (RN-ORD-10) e a lista se atualiza logo
 * depois de lançar — sob carga, tocar antes enviaria só parte dos itens.
 */
export async function sendRound(page: Page, count: number) {
  await page.getByRole('button', { name: `Enviar para a cozinha (${String(count)})` }).click();
  await expect(page.getByRole('status').filter({ hasText: /Rodada \d+ enviada/ })).toBeVisible();
}
