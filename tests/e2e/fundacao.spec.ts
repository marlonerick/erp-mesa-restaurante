import { expect, test } from '@playwright/test';

test.describe('Fundação (Etapa 1)', () => {
  test('a raiz leva ao login, em português', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle('Entrar · ERP Restaurante');
    expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR');
  });

  test('toda resposta traz requestId, CSP com nonce e cabeçalhos de segurança', async ({
    request,
  }) => {
    const response = await request.get('/login');
    const headers = response.headers();

    expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('/health e /ready respondem 200 sem cache', async ({ request }) => {
    for (const path of ['/health', '/ready']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['cache-control'], path).toBe('no-store');
    }
  });
});
