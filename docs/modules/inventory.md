# Inventory — Especificação (SDD)

> Status: Aprovado — Etapa: 5 — Responsável: domain-spec
> Decisões: Q-01 (ADR-0006, opção A), ADR-0007, E5-1 a E5-6 (docs/requirements/perguntas-abertas.md),
> ADR-0003 (valores exatos), ADR-0008 (transação e travas), ADR-0009 (isolamento)

## 1. Objetivo
Saber **quanto há de cada insumo em cada loja**, quanto ele custa (custo médio) e por que o saldo
mudou. Toda mudança de saldo é uma **movimentação** gravada junto com o saldo.

## 2. Glossário
| Termo | Significado |
|---|---|
| Insumo | Ingrediente ou item comprado (pão, carne, refrigerante lata). Cadastrado **por empresa**. |
| Unidade base | `g`, `ml` ou `un`. Todo saldo e toda ficha técnica ficam na unidade base. |
| Conversão | Como transformar a unidade de compra na base: fixas (kg→g ×1000, L→ml ×1000) e do insumo ("caixa" = 12 un). |
| Saldo | Quantidade do insumo **na loja** (pode ficar negativo com `PERMITIR_COM_ALERTA`). |
| Custo médio | Custo por unidade base (R$/g, R$/ml, R$/un), com 6 casas decimais (Q-19). |
| Movimentação | Registro imutável: tipo, quantidade (com sinal), custo, saldo depois, quem, quando, dia operacional, origem. |

## 3. Regras de negócio

### Cadastro
- **RN-INV-01** — Toda leitura e alteração fica na **empresa da loja ativa** (insumos) e na **loja
  ativa** (saldo e movimentações). Insumo de outra empresa responde "não encontrado".
- **RN-INV-02** — Insumo: nome de 2 a 80 caracteres, único na empresa (sem diferenciar maiúsculas e
  acentos); unidade base `g`, `ml` ou `un`, **definida no cadastro e imutável** (as movimentações
  dependem dela). Desativado, nunca apagado; desativado não recebe entradas nem entra em fichas
  novas, mas continua aparecendo no extrato e pode ter o saldo corrigido por contagem.
- **RN-INV-03** — Conversão do insumo: nome da unidade (1 a 20 caracteres, único no insumo, ex.:
  "caixa", "fardo") e fator para a base (maior que zero, até 3 casas decimais). Pode ser excluída
  (é configuração; o extrato guarda o texto do que foi digitado).

### Quantidade digitada
- **RN-INV-04** — Quantidade: vírgula **ou** ponto como separador decimal, até 3 casas, sem
  separador de milhar ("1,5" = "1.5" = um e meio; "1500" = mil e quinhentos). Unidades aceitas no
  lançamento: as da base (`kg`/`g` para g; `L`/`ml` para ml; `un`) e as conversões do insumo.

### Movimentações manuais (E5-1: `inventory.manage`)
- **RN-INV-05** — **Entrada** (compra, E5-2): quantidade > 0 na unidade da compra + **valor total
  pago** (R$ 0,00 a R$ 99.999,99). Recalcula o custo médio: `(saldo⁺ × custo + valor pago) ÷
  (saldo⁺ + quantidade)`, onde `saldo⁺` é o saldo, ou zero se negativo (E5-3). Insumo desativado
  não recebe entrada.
- **RN-INV-06** — **Saída** (uso interno, transferência informal): quantidade > 0 e observação
  obrigatória (3 a 200 caracteres).
- **RN-INV-07** — **Perda** (E5-4): quantidade > 0 e motivo: `VENCIDO`, `ESTRAGADO`,
  `ERRO_PREPARO`, `QUEBRA` ou `OUTRO` (este com observação obrigatória).
- **RN-INV-08** — **Contagem** (ajuste): a pessoa informa **quanto contou** (≥ 0); o sistema grava
  um `AJUSTE` com a diferença para o saldo **no momento de salvar** (a contagem é a verdade). Se a
  diferença for zero, nada é gravado.
- **RN-INV-09** — Saída e perda obedecem à política da loja (ADR-0007): com `BLOQUEAR`, o saldo não
  pode ficar negativo (`INSUFFICIENT_STOCK`); com `PERMITIR_COM_ALERTA`, grava e avisa.
- **RN-INV-10** — Valor da movimentação: entrada = valor pago; demais = quantidade × custo médio
  do momento, arredondado a centavos uma única vez (ADR-0003). Custo médio só muda na entrada.

### Mínimo e alertas
- **RN-INV-11** — Estoque mínimo por insumo **na loja** (≥ 0). Alerta quando `saldo ≤ mínimo` e o
  mínimo é maior que zero, mostrando insumo, saldo e mínimo. Alterar o mínimo é um valor absoluto
  (sem versão, não conflita com movimentações).

### Baixa por venda (Q-01 = A, ADR-0006) — usada pela comanda na Etapa 6
- **RN-INV-12** — **Consumo** ao enviar a rodada para a cozinha: uma `CONSUMO_VENDA` por insumo de
  cada item (origem = item do pedido). As linhas de saldo são travadas em ordem de insumo
  (evita deadlock). Com `BLOQUEAR`, falta em qualquer insumo recusa **tudo**
  (`INSUFFICIENT_STOCK`, listando insumo, saldo e necessário); com `PERMITIR_COM_ALERTA`, grava e
  devolve os avisos.
- **RN-INV-13** — **Estorno** (item cancelado antes do preparo): uma `ESTORNO_VENDA` para cada
  consumo daquela origem, com a **mesma quantidade e o mesmo custo** do consumo (não usa o custo de
  hoje). Estornar duas vezes não faz nada.
- **RN-INV-14** — **Perda por cancelamento depois do preparo**: o insumo já saiu; o consumo vira
  perda — `ESTORNO_VENDA` + `PERDA` (motivo `CANCELAMENTO_APOS_PREPARO`) de mesma quantidade e custo.
  O saldo não muda; o CMV deixa de contar o item e a perda aparece no relatório de perdas.
- **RN-INV-15** — **CMV** de um período (dias operacionais, na loja) = soma dos valores de
  `CONSUMO_VENDA` menos `ESTORNO_VENDA` (E5-6: tela na Etapa 9). Perdas são somadas à parte.

### Concorrência e registro
- **RN-INV-16** — Saldo e movimentação na **mesma transação**; a linha de saldo é lida com
  `FOR UPDATE`. Duas movimentações simultâneas no mesmo insumo passam em fila: nenhuma se perde.
- **RN-INV-17** — Movimentação é **imutável** (nunca alterada nem apagada): corrigir = nova
  movimentação. Cada uma guarda saldo depois, custo, quem, quando, dia operacional (ADR-0013) e o
  texto digitado ("2 kg").

## 4. Entidades
| Entidade | Atributos | Invariantes |
|---|---|---|
| Ingredient | company, name, base_unit, active, version | nome único na empresa; base imutável |
| IngredientUnitConversion | ingredient, unit_name, factor_to_base | fator > 0; nome único no insumo |
| IngredientStock | store, ingredient, quantity, avg_unit_cost, min_quantity, version | sem linha = saldo 0, custo 0, mínimo 0 |
| StockMovement | store, ingredient, type, quantity (±), unit_cost, value_cents (±), balance_after, loss_reason?, note?, entered_text?, origin_type, origin_id?, user, occurred_at, operational_date | imutável |

## 5. Tipos de movimentação
| Tipo | Sinal | Quem | Auditoria |
|---|---|---|---|
| `ENTRADA` | + | `inventory.manage` | `STOCK_ENTRY` |
| `SAIDA` | − | `inventory.manage` | `STOCK_EXIT` |
| `PERDA` | − | `inventory.manage` / cancelamento | `STOCK_LOSS` (manual) |
| `AJUSTE` | ± | `inventory.manage` | `STOCK_ADJUSTMENT` |
| `CONSUMO_VENDA` | − | envio da rodada (Etapa 6) | — (a movimentação é o registro) |
| `ESTORNO_VENDA` | + | cancelamento (Etapa 6) | — |

## 6. Exceções
| Situação | Código | HTTP | Mensagem |
|---|---|---|---|
| Nome inválido / repetido | `INVALID_NAME` / `INGREDIENT_NAME_TAKEN` | 400 / 409 | … / Já existe um insumo com este nome (talvez desativado). |
| Unidade base inválida | `INVALID_BASE_UNIT` | 400 | Escolha grama, mililitro ou unidade. |
| Quantidade inválida | `INVALID_QUANTITY` | 400 | Informe uma quantidade maior que zero, com até 3 casas decimais (ex.: 1,5). |
| Unidade não aceita para o insumo | `INVALID_UNIT` | 400 | Esta unidade não serve para este insumo. |
| Fator de conversão inválido / nome repetido | `INVALID_CONVERSION` / `CONVERSION_NAME_TAKEN` | 400 / 409 | … |
| Valor pago inválido | `INVALID_PRICE` | 400 | Informe um valor entre R$ 0,00 e R$ 99.999,99. |
| Observação faltando | `NOTE_REQUIRED` | 400 | Explique o motivo (3 a 200 caracteres). |
| Motivo de perda inválido | `INVALID_LOSS_REASON` | 400 | Escolha um motivo da lista. |
| Insumo desativado (entrada/ficha) | `INGREDIENT_INACTIVE` | 422 | Este insumo está desativado. |
| Saldo insuficiente com `BLOQUEAR` | `INSUFFICIENT_STOCK` | 422 | Estoque insuficiente: {insumo} tem {saldo}, precisa de {necessário}. |
| Insumo/conversão inexistente ou de outra empresa | `INGREDIENT_NOT_FOUND` / `CONVERSION_NOT_FOUND` | 404 | … |
| Outra pessoa alterou antes | `CONCURRENT_MODIFICATION` | 409 | Outra pessoa alterou estes dados. Recarregue a página e tente de novo. |
| Loja trocada em outra aba | `STORE_CHANGED` | 409 | A loja mudou em outra aba. Recarregue a página e confira antes de salvar. |

## 7. Permissões (E5-1)
| Ação | Permissão |
|---|---|
| Ver insumos, saldos, extrato, alertas | `inventory.read` (ADMIN, GERENTE, COZINHA) |
| Cadastrar/alterar insumo e conversões, mínimo, entrada, saída, perda, contagem | `inventory.manage` (ADMIN, GERENTE) |
| Consumo, estorno, perda por cancelamento | Chamados pela comanda (Etapa 6) com a permissão dela |

## 8. Contratos
| Ação | Entrada | Saída | Auditoria |
|---|---|---|---|
| `ingredients.list` | `{ search?, includeInactive?, belowMinimumOnly? }` | insumos + saldo/custo/mínimo na loja ativa | — |
| `ingredients.get` | `ingredientId` | insumo + conversões + saldo + últimas 100 movimentações | — |
| `ingredients.create` | `{ name, baseUnit }` | `{ id }` | `INGREDIENT_CREATED` |
| `ingredients.update` | `{ ingredientId, version, name, active }` | ok | `INGREDIENT_UPDATED` |
| `conversions.add` / `remove` | `{ ingredientId, unitName, factor }` / `{ conversionId }` | ok | `INGREDIENT_UPDATED` |
| `stock.setMinimum` | `{ ingredientId, minimum }` | ok | `STOCK_MINIMUM_SET` |
| `stock.entry` | `{ ingredientId, quantity, unit, totalPaidCents, note? }` | ok | `STOCK_ENTRY` |
| `stock.exit` | `{ ingredientId, quantity, unit, note }` | avisos | `STOCK_EXIT` |
| `stock.loss` | `{ ingredientId, quantity, unit, reason, note? }` | avisos | `STOCK_LOSS` |
| `stock.count` | `{ ingredientId, counted, unit }` | ok | `STOCK_ADJUSTMENT` |
| Público (Etapa 6) | `consumeStock(tx, ctx, lines)`, `reverseConsumption(tx, ctx, origin)`, `consumptionToLoss(tx, ctx, origin)`, `costOfGoodsSold(tx, { storeId, from, to })`, `ingredientCosts(tx, { companyId, storeId })` | — | — |

## 9. Modelo de dados (migration 0006)
- `ingredient` (id, company_id, name, base_unit ENUM, active, version, timestamps) — UQ (company_id, name).
- `ingredient_unit_conversion` (id, ingredient_id, unit_name, factor_to_base DECIMAL(14,3)) — UQ
  (ingredient_id, unit_name); CK fator > 0.
- `ingredient_stock` (store_id, ingredient_id, quantity DECIMAL(14,3), avg_unit_cost DECIMAL(18,6),
  min_quantity DECIMAL(14,3), version) — PK (store_id, ingredient_id); IX ingredient_id; CK custo ≥ 0,
  mínimo ≥ 0.
- `stock_movement` (id, store_id, ingredient_id, type ENUM, quantity DECIMAL(14,3), unit_cost
  DECIMAL(18,6), value_cents BIGINT, balance_after DECIMAL(14,3), loss_reason ENUM NULL, note NULL,
  entered_text NULL, origin_type ENUM(`MANUAL`,`ORDER_ITEM`), origin_id NULL, user_id, occurred_at,
  operational_date) — IX (store_id, ingredient_id, occurred_at); IX (store_id, operational_date,
  type); IX (origin_type, origin_id); triggers recusam UPDATE e DELETE (RN-INV-17, como a auditoria).

## 10. Critérios de aceite
- **CA-INV-01** — Entrada em kg vira gramas e recalcula o custo médio → `tests/features/inventory/movimentacoes.feature`
- **CA-INV-02** — Contagem grava só a diferença → `movimentacoes.feature`
- **CA-INV-03** — Perda exige motivo; com `BLOQUEAR` não deixa o saldo negativo → `movimentacoes.feature`
- **CA-INV-04** — Alerta de estoque mínimo → `movimentacoes.feature`
- **CA-INV-05** — Consumo da venda, estorno e perda por cancelamento (ADR-0006) → `tests/features/inventory/baixa-por-venda.feature`
- **CA-INV-06** — Saldo de uma loja não mexe na outra; outra empresa não vê o insumo → `tests/integration/modules/inventory/inventory-rules.test.ts`
- **CA-INV-07** — Movimentações simultâneas no mesmo insumo não se perdem → `inventory-rules.test.ts`

## 11. Dependências
Organizations (loja ativa → empresa; política de estoque negativo, fuso e virada da loja), Audit.
Recipes (Etapa 5) e Orders (Etapa 6) usam a API pública.

## 12. Fora do escopo
Transferência entre lojas, pedido de compra/fornecedores, lote e validade, inventário por
período (fechamento), subfichas (P1), relatórios de estoque e CMV na tela (Etapa 9).
