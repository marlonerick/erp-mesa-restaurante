import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as health } from '@/app/health/route';
import { checkApplicationReadiness, checkReadiness } from '@/shared/http/readiness';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/ready com configuração inválida (revisão)', () => {
  it('responde 503 — e não 500 — quando falta DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', undefined);
    const result = await checkApplicationReadiness();
    expect(result.status).toBe(503);
  });
});

describe('/health — o processo está vivo', () => {
  it('responde 200 sem consultar o banco e sem cache', async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('checkReadiness — o banco responde', () => {
  it('200 quando o banco responde', async () => {
    const result = await checkReadiness(() => Promise.resolve());
    expect(result).toEqual({ status: 200, body: { status: 'ok', checks: { database: 'ok' } } });
  });

  it('503 quando o banco falha, sem expor o motivo', async () => {
    const result = await checkReadiness(() =>
      Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:3306')),
    );
    expect(result).toEqual({
      status: 503,
      body: { status: 'unavailable', checks: { database: 'fail' } },
    });
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

  it('503 quando o banco demora mais que o limite', async () => {
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
    const result = await checkReadiness(slow, 20);
    expect(result.status).toBe(503);
  });
});
