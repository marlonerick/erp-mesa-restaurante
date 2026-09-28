import { defineConfig } from 'drizzle-kit';

// Migrations são GERADAS (npm run db:generate), REVISADAS e versionadas em /drizzle.
// `drizzle-kit push` é proibido fora de banco descartável (ADR-0001).
export default defineConfig({
  dialect: 'mysql',
  schema: './src/shared/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.MIGRATOR_DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
