import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnv } from '@/shared/config/env';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'mysql://erp_app:x@localhost:3306/erp_dev',
};

describe('parseEnv', () => {
  it('aceita a configuração mínima e aplica os padrões', () => {
    const env = parseEnv(valid);

    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.DB_POOL_SIZE).toBe(10);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.MIGRATOR_DATABASE_URL).toBeUndefined();
  });

  it('converte DB_POOL_SIZE para número', () => {
    expect(parseEnv({ ...valid, DB_POOL_SIZE: '25' }).DB_POOL_SIZE).toBe(25);
  });

  it('falha informando a variável ausente, sem expor valores', () => {
    const run = () => parseEnv({ NODE_ENV: 'production' });

    expect(run).toThrow(InvalidEnvironmentError);
    expect(run).toThrow(/DATABASE_URL/);
  });

  it('rejeita URL de banco que não é MySQL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'postgres://u:p@h/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('não inclui a senha na mensagem de erro', () => {
    try {
      parseEnv({
        ...valid,
        DATABASE_URL: 'mysql://erp_app:segredo@localhost:3306/erp',
        DB_POOL_SIZE: '0',
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('segredo');
      expect(String(error)).toContain('DB_POOL_SIZE');
    }
  });

  it('rejeita nível de log desconhecido', () => {
    expect(() => parseEnv({ ...valid, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
