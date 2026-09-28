# Convenções de contrato (Server Actions e Route Handlers)

## 1. Template de contrato

Todo contrato documentado no SDD do módulo segue:

```text
Nome:          orders.sendRound  (Server Action)   |   GET /api/poll/kds  (Route Handler)
Autenticação:  sessão obrigatória
Permissão:     orders.create
Entrada:       schema Zod (nome do schema + campos)
Saída:         DTO (campos, tipos, dinheiro em centavos)
Erros:         lista de códigos possíveis
Validação:     regras além do Zod (ex.: produto ativo e disponível)
Paginação:     cursor | limit/offset | n/a
Filtros:       campos permitidos
Ordenação:     campos permitidos + padrão
Idempotência:  sim (chave do cliente) | natural | não se aplica
Concorrência:  version esperado | n/a
Auditoria:     eventos gerados
```

## 2. Resposta de sucesso e erro

Server Actions retornam um resultado discriminado (nunca lançam para o cliente):

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details: Record<string, unknown>; requestId: string } };
```

Route Handlers retornam o mesmo objeto `error` com status HTTP adequado.

Padrão global de erro (nunca expõe stack, SQL ou nome de tabela):

```json
{ "code": "ORDER_ALREADY_CLOSED", "message": "Esta conta já foi fechada.", "details": {}, "requestId": "..." }
```

| Classe | HTTP | Exemplos de `code` |
|---|---|---|
| Validação | 400 | `VALIDATION_ERROR` (details com campos) |
| Autenticação | 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` |
| Autorização | 403 | `FORBIDDEN`, `ELEVATED_AUTH_REQUIRED`, `STORE_ACCESS_DENIED` |
| Não encontrado | 404 | `ORDER_NOT_FOUND` (também usado para recurso de outra loja — não revela existência) |
| Conflito | 409 | `CONCURRENT_MODIFICATION`, `IDEMPOTENCY_KEY_REUSED`, `CASH_SESSION_ALREADY_OPEN` |
| Regra de negócio | 422 | `ORDER_ALREADY_CLOSED`, `PRODUCT_UNAVAILABLE`, `CASH_SESSION_REQUIRED`, `INSUFFICIENT_STOCK`, `DISCOUNT_ABOVE_LIMIT` |
| Limite | 429 | `RATE_LIMITED` |
| Interno | 500 | `INTERNAL_ERROR` (detalhe apenas no log, ligado ao `requestId`) |

Mensagens em português, prontas para exibir ao usuário final. Catálogo de códigos por módulo
em cada SDD.

## 3. Idempotência

- Comandos críticos recebem `idempotencyKey` (UUIDv7 gerado no cliente **uma vez por intenção**
  do usuário, reaproveitado em todo reenvio): registrar pagamento, enviar rodada, abrir caixa,
  fechar caixa, cancelar pagamento, fechar conta.
- Servidor grava `idempotency_record (store_id, idem_key, operation, request_hash, response)`
  **na mesma transação** do comando.
- Reenvio com mesma chave e mesmo `request_hash` → devolve a resposta original, sem efeitos.
- Mesma chave com payload diferente → `409 IDEMPOTENCY_KEY_REUSED`.
- Pagamento tem também `UNIQUE (store_id, idempotency_key)` na própria tabela (defesa em profundidade).
- Retenção dos registros: 7 dias (limpeza por job agendado simples — cron do host).

## 4. Concorrência

- Comandos que alteram conta, mesa, sessão de caixa ou saldo enviam `expectedVersion`.
- `UPDATE ... SET version = version + 1 WHERE id = ? AND version = ?`; 0 linhas → `409 CONCURRENT_MODIFICATION`.
- A UI recarrega o agregado e mostra aviso ("A conta foi alterada por outro usuário").

## 5. Paginação, filtros, ordenação

- Listagens operacionais (auditoria, movimentações, pedidos): **cursor** `(occurred_at, id)`.
- Relatórios tabulares: `page`/`pageSize` (máx. 100) com total.
- Filtros e ordenação apenas em campos declarados no contrato (whitelist validada por Zod).

## 6. Dinheiro e datas no contrato

- Valores sempre em **centavos inteiros** (`amountCents: number`), nunca string formatada.
- Quantidades como string decimal (`"0.350"`) validada por regex e convertida para `Quantity`.
- Datas em ISO-8601 UTC; `operationalDate` como `YYYY-MM-DD`.
