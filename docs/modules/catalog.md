# Catalog — Especificação (SDD)

> Status: Aprovado — Etapa: 4 — Responsável: domain-spec
> Decisões: Q-09, Q-10, E4-1 a E4-5 (docs/requirements/perguntas-abertas.md), ADR-0003, ADR-0008, ADR-0009

## 1. Objetivo
Manter o **cardápio**: categorias, produtos, grupos de adicionais e, em cada loja, o preço e a
disponibilidade do dia. A comanda (Etapa 6) e o caixa (Etapa 8) vendem a partir dele.

## 2. Glossário
| Termo | Significado |
|---|---|
| Catálogo | Categorias, produtos e adicionais **de uma empresa**, compartilhados pelas lojas dela. |
| Preço na loja | O valor do produto numa loja. Sem preço, o produto **não é vendido** naquela loja. |
| Ativo / desativado | Produto ativo existe no cardápio; desativado saiu (ex.: prato de verão) — em todas as lojas. |
| Disponível / acabou | Situação **do dia, na loja**: "acabou" tira o produto da comanda até alguém marcar "disponível". |
| Grupo de adicionais | Perguntas feitas ao lançar o produto, ex.: "Ponto da carne" (escolher 1) ou "Extras" (até 3). |
| Opção (adicional) | Uma escolha do grupo, com preço extra (pode ser R$ 0,00 — ex.: "Ao ponto"). |
| Vai para a cozinha | Produto com preparo (gera pedido no KDS). Refrigerante e água não vão (Q-08). |

## 3. Regras de negócio

### Escopo
- **RN-CAT-01** — O catálogo é da **empresa da loja ativa** (a loja vem da sessão, ADR-0009). Toda
  leitura e alteração fica limitada a ela: categoria, produto ou grupo de outra empresa responde
  "não encontrado" (não revela que existe). Formulários de **cadastro** e de **disponibilidade**
  enviam a loja da tela e são recusados com `STORE_CHANGED` se a sessão trocou de loja em outra aba.

### Categoria
- **RN-CAT-02** — Categoria: nome de 2 a 60 caracteres, único na empresa (maiúsculas e acentos não
  diferenciam: "Lanches" = "lanches"). Nasce **ativa** e no fim da lista. A ordem da lista é a ordem
  do cardápio; "Subir"/"Descer" troca a posição com a vizinha (não é auditado: só aparência).
- **RN-CAT-03** — Categoria é desativada, nunca apagada. Categoria desativada some do cardápio **com
  os produtos dela** (os produtos continuam ativos e voltam quando a categoria for reativada) e não
  recebe produtos novos.

### Produto
- **RN-CAT-04** — Produto: nome de 2 a 80 caracteres, único na empresa; categoria **ativa** da mesma
  empresa; descrição opcional (até 300); código (SKU) opcional (E4-4), de 1 a 30 letras, números,
  hífen, ponto ou sublinhado, gravado em maiúsculas e único na empresa; "vai para a cozinha"
  (padrão: sim). Vendido **por unidade** (Q-10).
- **RN-CAT-05** — Produto é **desativado, nunca apagado** (E4-2). Desativado some do cardápio de
  todas as lojas; preços e adicionais ficam guardados e voltam ao reativar. Itens já lançados em
  contas não mudam (o nome e o preço são copiados no lançamento — Etapa 6).
- **RN-CAT-06** — Adicionais do produto: os grupos marcados no produto (até 10), só da mesma empresa.
  Na comanda, aparecem em ordem alfabética.

### Preço e disponibilidade na loja
- **RN-CAT-07** — Preço na loja: de R$ 0,00 a R$ 99.999,99, guardado em **centavos** (ADR-0003).
  Definir, alterar ou remover o preço exige `products.update` **naquela loja** — o gerente do Centro
  não mexe no preço da Praia. "Parar de vender nesta loja" remove o preço. Loja nova começa sem
  nenhum produto à venda.
- **RN-CAT-08** — Texto do valor digitado (preço e adicional): aceita "32", "32,5", "32,50",
  "1.234,50", "R$ 32,50" e também "32.50" (ponto seguido de 1 ou 2 dígitos = centavos; de 3 dígitos
  = milhar: "1.234" = mil duzentos e trinta e quatro reais). Nunca arredonda escondido: 3 casas
  decimais é recusado.
- **RN-CAT-09** — Disponibilidade (E4-1): "acabou" e "disponível" valem **só na loja ativa** e exigem
  `products.availability`. É um valor absoluto (marcar "acabou" duas vezes não muda nada) — por isso
  não usa versão e não conflita com quem está editando o preço ao mesmo tempo. Só grava auditoria
  quando muda. Preço novo na loja nasce **disponível**.
- **RN-CAT-10** — **Cardápio da loja** (o que a comanda pode lançar): produto ativo **e** categoria
  ativa **e** com preço na loja **e** disponível. A tela de disponibilidade mostra os produtos do
  cardápio (disponíveis e esgotados).

### Adicionais (Q-09)
- **RN-CAT-11** — Grupo de adicionais: nome de 2 a 60, único na empresa; **mínimo** de escolhas
  (0 a 10; 0 = opcional) e **máximo** (1 a 10), com mínimo ≤ máximo. Ex.: "Ponto da carne" mín. 1 e
  máx. 1; "Extras" mín. 0 e máx. 3. Grupo desativado some dos produtos.
- **RN-CAT-12** — Opção: nome de 1 a 60, único no grupo; preço extra de R$ 0,00 a R$ 9.999,99,
  **o mesmo em todas as lojas** da empresa (Q-09). Opção desativada não aparece. O consumo de estoque
  do adicional vem da ficha técnica dele (Etapa 5). A tela avisa quando o mínimo do grupo é maior que
  o número de opções ativas (o produto não poderia ser lançado — conferido na Etapa 6).

### Concorrência e auditoria
- **RN-CAT-13** — Alterar categoria, produto, preço na loja, grupo ou opção usa bloqueio otimista
  (`version`, ADR-0008): se outra pessoa salvou antes, a alteração é recusada com
  `CONCURRENT_MODIFICATION` e a tela recarrega com os dados novos. Salvar sem mudar nada não grava
  nem audita.
- **RN-CAT-14** — Toda alteração é auditada com antes/depois só dos campos que mudaram. Mudanças do
  catálogo da empresa são registradas **sem loja** (valem para todas); preço e disponibilidade, com
  a **loja afetada**.

## 4. Entidades
| Entidade | Atributos relevantes | Invariantes |
|---|---|---|
| Category | company, name, sort_order, active, version | nome único na empresa |
| Product | company, category, name, sku?, description?, requires_preparation, active, version | nome e sku únicos na empresa; categoria da mesma empresa |
| ProductStore | store, product, price_cents, available, version | 0 ≤ preço ≤ 9 999 999 centavos; loja da mesma empresa |
| ModifierGroup | company, name, min_select, max_select, active, version | 0 ≤ mín ≤ máx; 1 ≤ máx ≤ 10 |
| Modifier | group, name, price_delta_cents, active, version | nome único no grupo; 0 ≤ preço ≤ 999 999 centavos |
| ProductModifierGroup | product, group | mesma empresa; até 10 por produto |

ERD: maps/database/erd.md.

## 5. Estados
Produto, categoria, grupo e opção: `ativo ⇄ desativado`. Produto na loja: `sem preço → com preço
(disponível ⇄ acabou) → sem preço`.

| De → para | Comando | Permissão | Auditoria |
|---|---|---|---|
| ativo → desativado (produto) | `products.setStatus` | `products.update` | `PRODUCT_DISABLED` |
| desativado → ativo (produto) | `products.setStatus` | `products.update` | `PRODUCT_ENABLED` |
| sem preço → com preço, ou preço alterado | `products.setStorePrice` | `products.update` na loja | `PRODUCT_PRICE_SET` |
| com preço → sem preço | `products.removeFromStore` | `products.update` na loja | `PRODUCT_REMOVED_FROM_STORE` |
| disponível ⇄ acabou | `availability.set` | `products.availability` (loja ativa) | `PRODUCT_AVAILABILITY_CHANGED` |

## 6. Exceções
| Situação | Código | HTTP | Mensagem |
|---|---|---|---|
| Nome inválido | `INVALID_NAME` | 400 | Informe um nome entre N e M caracteres. |
| Nome repetido | `CATEGORY_NAME_TAKEN` / `PRODUCT_NAME_TAKEN` / `MODIFIER_GROUP_NAME_TAKEN` / `MODIFIER_NAME_TAKEN` | 409 | Já existe … com este nome (talvez desativado). |
| Código (SKU) inválido / repetido | `INVALID_SKU` / `SKU_TAKEN` | 400 / 409 | Use de 1 a 30 letras, números, hífen, ponto ou sublinhado. / Já existe um produto com este código. |
| Descrição longa | `INVALID_DESCRIPTION` | 400 | A descrição pode ter até 300 caracteres. |
| Valor inválido | `INVALID_PRICE` | 400 | Informe um valor entre R$ 0,00 e R$ 99.999,99 (ex.: 32,50). |
| Adicional com valor inválido | `INVALID_MODIFIER_PRICE` | 400 | Informe um valor entre R$ 0,00 e R$ 9.999,99. |
| Mínimo/máximo inválidos | `INVALID_SELECTION_LIMITS` | 400 | O máximo vai de 1 a 10 e o mínimo, de 0 até o máximo. |
| Mais de 10 grupos no produto | `TOO_MANY_MODIFIER_GROUPS` | 400 | Um produto pode ter até 10 grupos de adicionais. |
| Categoria desativada | `CATEGORY_INACTIVE` | 422 | Esta categoria está desativada. Escolha outra ou reative-a. |
| Não encontrado (ou de outra empresa) | `CATEGORY_NOT_FOUND` / `PRODUCT_NOT_FOUND` / `MODIFIER_GROUP_NOT_FOUND` / `MODIFIER_NOT_FOUND` / `STORE_NOT_FOUND` | 404 | … não encontrado(a). |
| Produto fora do cardápio da loja (disponibilidade) | `PRODUCT_NOT_ON_MENU` | 422 | Este produto não é vendido nesta loja. |
| Sem permissão (inclusive na loja do preço) | `FORBIDDEN` | 403 | Você não tem permissão para esta ação. |
| Outra pessoa alterou antes | `CONCURRENT_MODIFICATION` | 409 | Outra pessoa alterou estes dados. Recarregue a página e tente de novo. |
| Loja trocada em outra aba | `STORE_CHANGED` | 409 | A loja mudou em outra aba. Recarregue a página e confira antes de salvar. |

## 7. Permissões
| Ação | Permissão | Escopo |
|---|---|---|
| Ver categorias, produtos, adicionais | `products.read` | Loja ativa (empresa dela) |
| Cadastrar categoria, produto, grupo, opção | `products.create` | Loja ativa |
| Alterar, ordenar, desativar/reativar | `products.update` | Loja ativa |
| Definir/remover preço numa loja | `products.update` | **Na loja do preço** |
| Marcar "acabou"/"disponível" | `products.availability` (nova — E4-1) | Loja ativa |

Perfis: `products.create`/`update` — ADMIN e GERENTE (inalterado); `products.availability` — ADMIN,
GERENTE, CAIXA e COZINHA (migration 0005). As telas de cadastro aparecem para quem tem
`products.update`; a de disponibilidade, para quem tem `products.availability`.

## 8. Contratos (casos de uso)
| Ação | Entrada | Saída | Auditoria |
|---|---|---|---|
| `categories.list` | — | categorias da empresa, na ordem, com nº de produtos | — |
| `categories.create` | `{ name }` | `{ id }` | `CATEGORY_CREATED` |
| `categories.update` | `{ categoryId, version, name, active }` | ok | `CATEGORY_UPDATED` |
| `categories.move` | `{ categoryId, direction: 'UP' \| 'DOWN' }` | ok | — |
| `products.list` | `{ search?, categoryId?, includeInactive? }` | produtos + preço/disponibilidade na loja ativa | — |
| `products.get` | `productId` | produto + grupos + preços nas lojas em que a pessoa pode alterar | — |
| `products.create` | `{ name, categoryId, sku?, description?, requiresPreparation, modifierGroupIds, priceHere? }` | `{ id }` | `PRODUCT_CREATED` (+ `PRODUCT_PRICE_SET`) |
| `products.update` | `{ productId, version, ...dados, modifierGroupIds }` | ok | `PRODUCT_UPDATED` |
| `products.setStatus` | `{ productId, version, active }` | ok | `PRODUCT_DISABLED` / `PRODUCT_ENABLED` |
| `products.setStorePrice` | `{ productId, storeId, priceCents, version \| null }` | ok | `PRODUCT_PRICE_SET` |
| `products.removeFromStore` | `{ productId, storeId, version }` | ok | `PRODUCT_REMOVED_FROM_STORE` |
| `modifierGroups.list` / `get` | — / `groupId` | grupos com opções | — |
| `modifierGroups.create` | `{ name, minSelect, maxSelect }` | `{ id }` | `MODIFIER_GROUP_CREATED` |
| `modifierGroups.update` | `{ groupId, version, name, minSelect, maxSelect, active }` | ok | `MODIFIER_GROUP_UPDATED` |
| `modifiers.create` | `{ groupId, name, priceDeltaCents }` | `{ id }` | `MODIFIER_CREATED` |
| `modifiers.update` | `{ modifierId, version, name, priceDeltaCents, active }` | ok | `MODIFIER_UPDATED` |
| `availability.list` | — (loja ativa) | cardápio da loja por categoria, com "acabou" | — |
| `availability.set` | `{ productId, available }` | ok | `PRODUCT_AVAILABILITY_CHANGED` (se mudou) |
| Consulta pública | `listStoreMenu(tx, { companyId, storeId })` — cardápio vendável (RN-CAT-10) com adicionais ativos | — | — |

## 9. Modelo de dados (migration 0005)
- `category` (id, company_id, name, sort_order, active, version, timestamps) — UQ (company_id, name).
- `product` (id, company_id, category_id, name, sku NULL, description NULL, requires_preparation,
  active, version, timestamps) — UQ (company_id, name); UQ (company_id, sku); IX category_id.
- `product_store` (store_id, product_id, price_cents INT UNSIGNED, available, version, timestamps) —
  PK (store_id, product_id); IX product_id; CK price_cents ≤ 9 999 999.
- `modifier_group` (id, company_id, name, min_select, max_select, active, version, timestamps) —
  UQ (company_id, name); CK mín ≤ máx, máx 1–10.
- `modifier` (id, modifier_group_id, name, price_delta_cents, active, version, timestamps) —
  UQ (modifier_group_id, name); CK preço ≤ 999 999.
- `product_modifier_group` (product_id, modifier_group_id) — PK (product_id, modifier_group_id);
  IX modifier_group_id.
- Permissão `products.availability` para ADMIN, GERENTE, CAIXA e COZINHA.

Diferenças em relação ao modelo inicial (docs/database/modelo-de-dados.md): sem `sale_unit` (Q-10:
só unidade); sem `deleted_at` (E4-2: desativar é o arquivamento); sem `station_id` em
`product_store` (uma estação por loja no MVP — entra com o cadastro de praças); sem `sort_order` em
adicionais (ordem alfabética).

## 10. Critérios de aceite
- **CA-CAT-01** — Gerente cadastra categoria e produto; nome repetido é recusado → `tests/features/catalog/produtos.feature`
- **CA-CAT-02** — Produto desativado some do cardápio e volta ao reativar, com o mesmo preço → `produtos.feature`
- **CA-CAT-03** — Categoria desativada tira os produtos dela do cardápio → `categorias.feature`
- **CA-CAT-04** — Preço diferente por loja; gerente de uma loja não altera o preço de outra → `precos-por-loja.feature`
- **CA-CAT-05** — Dois gerentes alterando o mesmo preço: o segundo é avisado → `precos-por-loja.feature`
- **CA-CAT-06** — Cozinha marca "acabou" e o produto sai do cardápio só naquela loja; garçom não pode → `disponibilidade.feature`
- **CA-CAT-07** — Grupo "Ponto da carne" (escolher 1) ligado ao produto aparece no cardápio → `adicionais.feature`
- **CA-CAT-08** — Catálogo de outra empresa/organização é invisível → `tests/integration/modules/catalog/catalog-rules.test.ts`
- **CA-CAT-09** — Texto de valor ("32,50", "1.234,50", "32.50") → `tests/unit/shared/kernel/money-text.test.ts`

## 11. Dependências
Organizations (loja ativa → empresa; lojas da empresa), Authorization (em quais lojas a pessoa tem
`products.update`), Audit. Nenhum módulo depende do Catalog ainda; Orders (Etapa 6) usará
`listStoreMenu`.

## 12. Testes previstos
Unit (valor em texto com fast-check, regras de nome/código/limites), integração com MySQL real (BDD,
isolamento entre empresas e organizações, concorrência de preço, permissão por loja), E2E (cadastro
no computador; "acabou" no celular).

## 13. Fora do escopo
Foto (E4-3), venda por peso (Q-10), cadastro de praças/estações e produto por estação, combos,
preço por horário, ficha técnica e consumo de estoque (Etapa 5), importação de cardápio.
