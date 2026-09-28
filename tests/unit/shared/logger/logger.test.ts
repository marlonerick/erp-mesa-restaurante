import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, withContext } from '@/shared/logger/logger';

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

  it('respeita o nível configurado', () => {
    const { logger, lines } = captureLogger('warn');
    logger.info('não aparece');
    logger.error('aparece');

    expect(lines.map((line) => line.msg)).toEqual(['aparece']);
  });
});
