# Recipes — Especificação (SDD)

> Status: Aprovado — Etapa: 5 — Responsável: domain-spec
> Decisões: Q-01 (ADR-0006 A), Q-09 (adicional com ficha própria), E5-1, E5-5

## 1. Objetivo
Dizer **quanto de cada insumo** vai em cada produto e em cada adicional, calcular o **custo
teórico** e a **margem** na loja, e transformar um item vendido em consumo de insumos.

## 2. Regras de negócio
- **RN-REC-01** — Ficha técnica pertence a **um produto** ou a **um adicional** (Q-09) da empresa da
  loja ativa; no máximo uma por produto/adicional. Produto/adicional de outra empresa = "não
  encontrado".
- **RN-REC-02** — Linhas: insumo **ativo** da mesma empresa + quantidade **na unidade base do
  insumo** para **uma** unidade vendida (> 0, até 3 casas). Sem insumo repetido; até 30 linhas.
  Ficha vazia = sem ficha (item não baixa estoque).
- **RN-REC-03** — Salvar a ficha substitui as linhas inteiras e usa bloqueio otimista (`version`;
  `null` = a tela mostrava "sem ficha"). Salvar igual não grava nem audita. Auditoria
  `RECIPE_UPDATED` com as linhas antes/depois.
- **RN-REC-04** — **Custo teórico** = Σ (quantidade × custo médio do insumo **na loja ativa**),
  somado com precisão total e arredondado a centavos uma vez (ADR-0003). **Margem** = (preço na
  loja − custo) ÷ preço, em % com 1 casa; sem preço na loja, não há margem.
- **RN-REC-05** — Mudar a ficha vale **daqui para frente** (E5-5): consumos já gravados guardam a
  quantidade e o custo do momento.
- **RN-REC-06** — **Consumo de um item vendido** (Etapa 6): (ficha do produto × quantidade) + Σ
  (ficha do adicional × quantidade do adicional × quantidade do item), somado por insumo, arredondado
  a milésimos (half-up). Item sem ficha não baixa nada.

## 3. Permissões (E5-1)
| Ação | Permissão |
|---|---|
| Ver fichas, custo e margem | `recipes.read` (ADMIN, GERENTE, COZINHA) |
| Salvar ficha | `recipes.manage` (ADMIN, GERENTE) |

## 4. Exceções
| Situação | Código | HTTP |
|---|---|---|
| Produto / adicional inexistente ou de outra empresa | `PRODUCT_NOT_FOUND` / `MODIFIER_NOT_FOUND` | 404 |
| Insumo inexistente ou de outra empresa | `INGREDIENT_NOT_FOUND` | 404 |
| Insumo desativado | `INGREDIENT_INACTIVE` | 422 |
| Insumo repetido / linhas demais | `DUPLICATE_INGREDIENT` / `TOO_MANY_LINES` | 400 |
| Quantidade inválida | `INVALID_QUANTITY` | 400 |
| Outra pessoa alterou antes | `CONCURRENT_MODIFICATION` | 409 |

## 5. Contratos
| Ação | Entrada | Saída | Auditoria |
|---|---|---|---|
| `recipes.list` | — | produtos e adicionais com custo, preço na loja, margem e "tem ficha" | — |
| `recipes.get` | `{ kind: 'PRODUCT' \| 'MODIFIER', id }` | linhas com custo por linha, total, preço e margem | — |
| `recipes.save` | `{ kind, id, version \| null, lines: [{ ingredientId, quantity }] }` | ok | `RECIPE_UPDATED` |
| Público (Etapa 6) | `consumptionForItems(tx, companyId, items)` e `consumeForItems(tx, ctx, items)` (usa Inventory) | linhas por insumo / avisos | — |

## 6. Modelo de dados (migration 0006)
- `recipe` (id, company_id, product_id NULL UNIQUE, modifier_id NULL UNIQUE, version, updated_by,
  timestamps) — CK exatamente um de produto/adicional.
- `recipe_item` (id, recipe_id, ingredient_id, quantity DECIMAL(14,3)) — UQ (recipe_id,
  ingredient_id); IX ingredient_id; CK quantidade > 0.

## 7. Critérios de aceite
- **CA-REC-01** — Ficha do X-Burger mostra custo teórico e margem → `tests/features/recipes/ficha-tecnica.feature`
- **CA-REC-02** — Ficha do adicional "Bacon" soma no consumo do item → `ficha-tecnica.feature`
- **CA-REC-03** — Duas pessoas salvando a mesma ficha: a segunda é avisada → `ficha-tecnica.feature`

## 8. Dependências
Catalog (produtos, adicionais e preço na loja), Inventory (insumos, custo médio, consumo), Audit.
