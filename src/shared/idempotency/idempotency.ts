import { and, eq } from 'drizzle-orm';
import { MYSQL_ERRNO, mysqlErrno } from '../db/mysql-errors';
import type { Transaction } from '../db/transaction';
import { DomainError, type Id, isId } from '../kernel';
import { hashRequest } from './request-hash';
import { idempotencyRecord } from './schema';

export interface IdempotentRequest {
  readonly storeId: Id;
  /** UUIDv7 gerado no cliente UMA vez por intenção do usuário e reutilizado nos reenvios. */
  readonly key: string;
  /** Nome do comando, ex.: "payments.create". */
  readonly operation: string;
  /** Dados do comando; comparados por hash para detectar reuso indevido da chave. */
  readonly payload: unknown;
}

/**
 * Forma de um valor depois de ida e volta por JSON: datas viram texto, tipos de valor usam o
 * toJSON (Money vira centavos) e "sem retorno" vira null.
 */
export type Jsonified<T> = T extends Date
  ? string
  : T extends { toJSON(): infer R }
    ? Jsonified<R>
    : T extends undefined
      ? null
      : T extends readonly (infer U)[]
        ? Jsonified<U>[]
        : T extends object
          ? { [K in keyof T]: Jsonified<T[K]> }
          : T;

export interface IdempotentOutcome<T> {
  /** Sempre a forma JSON — idêntica na primeira execução e nos reenvios. */
  readonly result: Jsonified<T>;
  /** true quando a resposta veio de uma execução anterior (reenvio). */
  readonly replayed: boolean;
}

function toJsonForm<T>(value: T): Jsonified<T> {
  return JSON.parse(JSON.stringify(value ?? null)) as Jsonified<T>;
}

const OPERATION_FORMAT = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)+$/;

/**
 * Executa um comando no máximo uma vez por (loja, chave), DENTRO da transação do caso de uso
 * (docs/api/convencoes.md §3). O resultado deve ser um DTO serializável em JSON; ele é devolvido
 * SEMPRE na forma JSON (`Jsonified<T>`), para que a primeira execução e o reenvio sejam iguais.
 *
 * Funcionamento: insere a chave primeiro. Se outra transação já a inseriu, o INSERT espera o
 * commit dela, falha com chave duplicada, e então a resposta gravada é devolvida. Se a
 * transação do comando falhar, a chave é desfeita junto e um reenvio executa normalmente.
 */
export async function executeIdempotent<T>(
  tx: Transaction,
  request: IdempotentRequest,
  execute: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  if (!isId(request.key)) {
    throw new DomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Chave de idempotência inválida.',
      'VALIDATION',
    );
  }
  if (request.operation.length > 64 || !OPERATION_FORMAT.test(request.operation)) {
    throw new DomainError(
      'INVALID_IDEMPOTENCY_OPERATION',
      'Operação de idempotência inválida.',
      'VALIDATION',
    );
  }

  const requestHash = hashRequest(request.operation, request.payload);
  const where = and(
    eq(idempotencyRecord.storeId, request.storeId),
    eq(idempotencyRecord.idemKey, request.key),
  );

  try {
    await tx.insert(idempotencyRecord).values({
      storeId: request.storeId,
      idemKey: request.key,
      operation: request.operation,
      requestHash,
      response: null,
    });
  } catch (error) {
    if (mysqlErrno(error) !== MYSQL_ERRNO.DUPLICATE_ENTRY) {
      throw error;
    }
    // Leitura com trava lê a versão confirmada mais recente (não o snapshot da transação)
    const [existing] = await tx
      .select({
        operation: idempotencyRecord.operation,
        requestHash: idempotencyRecord.requestHash,
        response: idempotencyRecord.response,
      })
      .from(idempotencyRecord)
      .where(where)
      .for('share');

    if (existing?.operation !== request.operation || existing.requestHash !== requestHash) {
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'Esta chave já foi usada em outra operação. Recarregue a tela e tente novamente.',
        'CONFLICT',
      );
    }
    return { result: (existing.response ?? null) as Jsonified<T>, replayed: true };
  }

  const result = toJsonForm(await execute());
  await tx.update(idempotencyRecord).set({ response: result }).where(where);
  return { result, replayed: false };
}
