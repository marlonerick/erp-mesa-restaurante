import type { Page } from '@playwright/test';

// Equipe fictícia criada por scripts/seed-dev.ts no banco de E2E.
export const TEAM = {
  admin: { username: 'admin', password: 'Admin@2026', name: 'Dona Admin' },
  gerente: { username: 'gerente', password: 'Gerente@2026', name: 'Carla Gerente' },
  caixa: { username: 'caixa', password: 'Caixa@2026', name: 'Bia Caixa' },
  joao: { username: 'joao', password: 'Garcom@2026', name: 'João Garçom', pin: '305917' },
  ana: { username: 'ana', password: 'Garcom@2026', name: 'Ana Garçom' },
};

/** Texto único por execução (o banco de E2E é compartilhado entre testes e execuções). */
export const unique = (base: string) => `${base}.${Math.random().toString(36).slice(2, 8)}`;

export async function submitLogin(page: Page, username: string, password: string, shared = false) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  if (shared) await page.getByLabel('Este aparelho é compartilhado').check();
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Entra e ESPERA o login terminar (como uma pessoa esperaria a tela mudar). */
export async function login(page: Page, username: string, password: string, shared = false) {
  await submitLogin(page, username, password, shared);
  await page.waitForURL(/\/(inicio|trocar-senha)$/);
}

/** No celular, o menu (e os botões da conta) fica na gaveta (E3-4): abre antes de usar. */
export async function openMenuIfMobile(page: Page) {
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  if (await menu.isVisible()) await menu.click();
}
