import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const PORT = 3100;
const baseURL = `http://localhost:${String(PORT)}`;

// Banco de E2E (erp_e2e) no MySQL de desenvolvimento/CI. Valores fictícios, iguais ao compose.
const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? 'mysql://erp_app:app_dev_only@localhost:3306/erp_e2e';
const e2eMigratorUrl =
  process.env.E2E_MIGRATOR_DATABASE_URL ??
  'mysql://erp_migrator:migrator_dev_only@localhost:3306/erp_e2e';

// Cenários .feature em português (playwright-bdd gera os testes em .features-gen)
const bddTestDir = defineBddConfig({
  features: 'tests/features/sistema/**/*.feature',
  steps: 'tests/e2e/steps/**/*.ts',
  outputDir: '.features-gen',
});

const viewports = [
  { name: 'celular', use: { ...devices['Pixel 7'] } },
  {
    name: 'tablet',
    use: { ...devices['Desktop Chrome'], viewport: { width: 810, height: 1080 }, hasTouch: true },
  },
  { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
];

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    ...viewports.map((viewport) => ({ ...viewport, testDir: 'tests/e2e', testMatch: '*.spec.ts' })),
    { name: 'bdd', testDir: bddTestDir, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Aplica migrations no banco de E2E, compila e sobe o servidor de produção
    command: 'node scripts/migrate.ts && npm run build && npm run start',
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: e2eDatabaseUrl,
      MIGRATOR_DATABASE_URL: e2eMigratorUrl,
      LOG_LEVEL: 'warn',
    },
  },
});
