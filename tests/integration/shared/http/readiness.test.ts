import { describe, expect, inject, it } from 'vitest';
import { createDatabase } from '@/shared/db/client';
import { checkReadiness } from '@/shared/http/readiness';
import { useTestDatabase } from '../../../support/database';

const { ping } = useTestDatabase();

describe('/ready com MySQL real', () => {
  it('200 com o banco ligado', async () => {
    expect((await checkReadiness(ping)).status).toBe(200);
  });

  it('503 com o MySQL no ar, mas sem as tabelas do sistema (banco apagado — Etapa 10)', async () => {
    // Mesmo servidor, outro banco (sem a tabela `store`): "SELECT 1" passaria, a prontidão não
    const url = new URL(inject('databaseUrl'));
    url.pathname = '/information_schema';
    const empty = createDatabase({ url: url.toString(), poolSize: 1 });
    try {
      expect((await checkReadiness(empty.ping, 2000)).status).toBe(503);
    } finally {
      await empty.close();
    }
  });

  it('503 com o banco inacessível', async () => {
    // Porta 1 não tem MySQL: simula banco desligado
    const offline = createDatabase({ url: 'mysql://x:y@127.0.0.1:1/nada', poolSize: 1 });
    try {
      expect((await checkReadiness(offline.ping, 2000)).status).toBe(503);
    } finally {
      await offline.close();
    }
  });
});
