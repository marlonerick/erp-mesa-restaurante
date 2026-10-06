// Teste rápido depois de um deploy: entra no sistema pelo HTTPS e confere a tela inicial.
// Uso: SMOKE_URL=https://seu.dominio SMOKE_USER=admin SMOKE_PASSWORD=… node scripts/smoke-https.mjs
// (SMOKE_INSECURE=1 aceita certificado local — só para o teste no próprio computador)
import { chromium } from '@playwright/test';

const url = process.env.SMOKE_URL ?? 'https://localhost:8443';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: process.env.SMOKE_INSECURE === '1',
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  await page.goto(`${url}/login`);
  await page.getByLabel('Usuário', { exact: true }).fill(process.env.SMOKE_USER ?? 'admin');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.SMOKE_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(inicio|trocar-senha)$/, { timeout: 15_000 });
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name.endsWith('erp_session'));
  console.info(`Entrou: ${page.url()}`);
  console.info(
    `Cookie da sessão: ${session?.name ?? 'ausente'} (Secure: ${String(session?.secure)})`,
  );
  if (!session?.secure) process.exitCode = 1;
} finally {
  await browser.close();
}
