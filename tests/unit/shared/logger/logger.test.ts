import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionFailure } from '@/shared/errors/action-result';
import { createLogger, getLogger, withContext } from '@/shared/logger/logger';

function captureLogger(level = 'info') {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { logger: createLogger({ level, destination }), lines };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logger (Pino, README B.8)', () => {
  it('escreve JSON estruturado com nível, horário e mensagem', () => {
    const { logger, lines } = captureLogger();
    logger.info({ orderNumber: 7 }, 'Conta aberta');

    expect(lines[0]).toMatchObject({
      level: 'info',
      msg: 'Conta aberta',
      orderNumber: 7,
      service: 'erp',
    });
    expect(typeof lines[0]?.time).toBe('string');
  });

  it('nunca registra senha, PIN, token, cookie ou cabeçalho de autorização', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        password: 'senha-secreta',
        user: { pin: '123456', passwordHash: '$argon2id$x' },
        token: 'tok-abc',
        headers: { authorization: 'Bearer xyz', cookie: '__Host-session=abc' },
        session: { token: 'tok-def' },
      },
      'tentativa de login',
    );

    const text = JSON.stringify(lines[0]);
    for (const secret of [
      'senha-secreta',
      '123456',
      '$argon2id$x',
      'tok-abc',
      'Bearer xyz',
      '__Host-session=abc',
      'tok-def',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[REDACTED]');
  });

  it('mascara CPF, set-cookie, segredos e campos em níveis mais profundos (revisão)', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        cpf: '123.456.789-00',
        customer: { cpf: '987.654.321-00' },
        response: { headers: { 'set-cookie': '__Host-session=xyz' } },
        payload: { user: { password: 'profunda', pin: '654321' } },
        secret: 'seg-1',
        accessToken: 'acc-1',
        refreshToken: 'ref-1',
      },
      'dados sensíveis',
    );

    const text = JSON.stringify(lines[0]);
    for (const secret of [
      '123.456.789-00',
      '987.654.321-00',
      '__Host-session=xyz',
      'profunda',
      '654321',
      'seg-1',
      'acc-1',
      'ref-1',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('erro de consulta do banco não vaza os parâmetros SQL no log (revisão)', () => {
    const { logger, lines } = captureLogger();
    const driverError = Object.assign(new Error("Duplicate entry for key 'uq_user_username'"), {
      errno: 1062,
      sql: "insert into user (username, password_hash) values ('ana', '$argon2id$SEGREDO')",
    });
    const error = new DrizzleQueryError(
      'insert into user (username, password_hash) values (?, ?)',
      ['ana', '$argon2id$SEGREDO'],
      driverError,
    );

    actionFailure(error, 'req-9', logger);

    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain('SEGREDO');
    expect(text).toContain('Failed query');
    expect(text).toContain('req-9');
  });

  it('adiciona requestId, storeId e userId em todas as linhas do contexto', () => {
    const { logger, lines } = captureLogger();
    withContext(logger, { requestId: 'req-1', storeId: 'store-1', userId: 'user-1' }).warn(
      'atenção',
    );

    expect(lines[0]).toMatchObject({
      requestId: 'req-1',
      storeId: 'store-1',
      userId: 'user-1',
      level: 'warn',
    });
  });

  it('getLogger funciona mesmo com o .env inválido (não depende do banco)', () => {
    vi.stubEnv('DATABASE_URL', undefined);
    vi.stubEnv('LOG_LEVEL', 'nivel-invalido');
    expect(() => getLogger()).not.toThrow();
  });

  it('respeita o nível configurado', () => {
    const { logger, lines } = captureLogger('warn');
    logger.info('não aparece');
    logger.error('aparece');

    expect(lines.map((line) => line.msg)).toEqual(['aparece']);
  });
});
