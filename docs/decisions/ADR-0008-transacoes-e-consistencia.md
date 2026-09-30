# ADR-0008 — Transações e consistência entre módulos

- Status: **Aceito** em 2026-09-28
- Data: 2026-09-27
- Responsável: architect

## Contexto
"Pagar conta" altera pagamento, conta, mesa, caixa, (estoque, se ADR-0006 = B), idempotência e
auditoria. Módulos não podem acessar tabelas uns dos outros. Não há fila no MVP.

## Opções
1. **Transação única por caso de uso** + eventos de domínio síncronos em processo.
2. Outbox + processamento assíncrono.
3. Saga/compensação.

## Decisão (proposta)
**Opção 1** no MVP.

- `UnitOfWork` em `shared/db`: o caso de uso de entrada abre a transação; os repositórios de
  todos os módulos envolvidos recebem o mesmo `tx`.
- Comunicação entre módulos por **caso de uso público** (ex.: `cashier.recordSale(tx, ctx, ...)`)
  ou **evento de domínio síncrono** publicado no `EventBus` em processo e tratado **dentro da
  mesma transação**. Falha em qualquer handler → rollback total.
- Nenhum I/O externo (HTTP, impressão) dentro da transação.
- Isolamento `REPEATABLE READ`; locking otimista por `version` nos agregados; `FOR UPDATE` em
  saldos de estoque, sequência de numeração e sessão de caixa durante o pagamento.
- Deadlock/lock timeout → retry automático até 5 vezes no caso de uso (apenas para erros
  MySQL 1213/1205), com espera crescente e aleatória (20–40 ms, dobrando), seguro porque o comando é
  idempotente. Eram 3 tentativas até a Etapa 7, quando 3 deadlocks seguidos apareceram sob carga
  nos testes (docs/weeks/etapa-07.md).
- Contar ou listar "com trava" (`FOR SHARE`/`FOR UPDATE`) em faixa de índice trava também o
  intervalo vizinho (gap lock). Onde a trava de uma linha-mãe (ex.: a conta) já coloca as escritas
  em fila, prefira travar a linha-mãe como **primeira leitura** da transação: a "foto" do
  REPEATABLE READ nasce depois dela e a leitura comum já vê tudo (lançar item — Etapa 7).
- Implementação (Etapa 1): `runInTransaction` em `src/shared/db/transaction.ts`, com isolamento
  `REPEATABLE READ` explícito. **A função do caso de uso é reexecutada por inteiro** a cada
  tentativa: ela só pode conter operações no banco — nenhum efeito externo nem alteração de estado
  capturado fora dela.

Outbox (opção 2) entra por novo ADR quando houver o primeiro efeito externo (PSP, fiscal, webhook).

## Consequências
- (+) Consistência forte, simples de testar com MySQL real.
- (−) Transações maiores; mitigado por mantê-las curtas e sem I/O externo.
