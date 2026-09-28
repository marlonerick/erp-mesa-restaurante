import { expect, test } from '@playwright/test';

test.describe('Fundação (Etapa 1)', () => {
  test('página inicial abre em português', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('ERP Restaurante');
    await expect(page.getByRole('heading', { name: 'ERP Restaurante' })).toBeVisible();
    expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR');
  });

  test('toda resposta traz requestId e cabeçalhos de segurança', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
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
