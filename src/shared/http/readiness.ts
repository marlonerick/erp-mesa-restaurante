import { getDatabase } from '../db/client';
import { getLogger } from '../logger/logger';

export interface ReadinessResult {
  readonly status: 200 | 503;
  readonly body: {
    readonly status: 'ok' | 'unavailable';
    readonly checks: { readonly database: 'ok' | 'fail' };
  };
}

const READY: ReadinessResult = { status: 200, body: { status: 'ok', checks: { database: 'ok' } } };
const NOT_READY: ReadinessResult = {
  status: 503,
  body: { status: 'unavailable', checks: { database: 'fail' } },
};

/** Verifica se o banco responde dentro do limite. Nunca expõe o motivo da falha na resposta. */
export async function checkReadiness(
  ping: () => Promise<void>,
  timeoutMs = 2000,
): Promise<ReadinessResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`banco não respondeu em ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([ping(), timeout]);
    return READY;
  } catch {
    return NOT_READY;
  } finally {
    clearTimeout(timer);
  }
}

/** Prontidão do banco da aplicação (rota /ready). A falha é registrada no log. */
export async function checkApplicationReadiness(): Promise<ReadinessResult> {
  try {
    const result = await checkReadiness(getDatabase().ping);
    if (result.status !== 200) {
      getLogger().warn('Prontidão: banco de dados não respondeu');
    }
    return result;
  } catch (error) {
    // Configuração inválida (ex.: variável ausente) também deixa o sistema "não pronto"
    getLogger().error({ err: error }, 'Prontidão: falha ao iniciar a conexão');
    return NOT_READY;
  }
}
