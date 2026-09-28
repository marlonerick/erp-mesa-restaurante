import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { When, Then } = createBdd();

let healthStatus = 0;

When('eu verifico a saúde do sistema', async ({ request }) => {
  healthStatus = (await request.get('/health')).status();
});

Then('o sistema responde que está no ar', () => {
  expect(healthStatus).toBe(200);
});

Then('o banco de dados está pronto para uso', async ({ request }) => {
  const response = await request.get('/ready');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } });
});
