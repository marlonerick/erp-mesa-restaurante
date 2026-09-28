# ADR-0007 — Política de estoque negativo

- Status: **Proposto**
- Data: 2026-09-27
- Responsável: domain-spec

## Contexto
Estoque de restaurante raramente é exato (entrada não lançada, rendimento diferente da ficha).
Bloquear venda por saldo incorreto para a operação; permitir sem aviso esconde problemas.

## Decisão (proposta)
Política **por loja** em `store.negative_stock_policy`:

| Política | Comportamento no consumo (ADR-0006) |
|---|---|
| `PERMITIR_COM_ALERTA` (**padrão**) | Consumo ocorre; saldo pode ficar negativo; a resposta traz `warnings: [INSUFFICIENT_STOCK]` com insumo, saldo e necessário; alerta no dashboard; nada é bloqueado |
| `BLOQUEAR` | A operação inteira (ex.: envio da rodada) falha com `422 INSUFFICIENT_STOCK` listando insumos; nada é gravado |

- Alterar a política exige `stores.manage` e gera auditoria.
- Ajustes manuais de estoque (`inventory.manage`) podem deixar saldo negativo apenas com `PERMITIR_COM_ALERTA`.
- Verificação feita com `SELECT ... FOR UPDATE` nas linhas de `ingredient_stock` envolvidas, em ordem
  determinística de `ingredient_id` (evita deadlock).

## Consequências
- (+) Operação não para por erro de cadastro; política rígida disponível para quem quer.
- (−) Relatório de estoque precisa destacar saldos negativos.
