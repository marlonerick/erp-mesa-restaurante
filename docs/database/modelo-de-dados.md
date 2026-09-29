# Modelo de dados do MVP

ERD em Mermaid: [maps/database/erd.md](../../maps/database/erd.md).
Status: **proposta** (depende dos ADRs 0001, 0003, 0004, 0006, 0007, 0009, 0013).

## 1. Convenções

| Tema | Regra | ADR |
|---|---|---|
| Nomes | Tabelas e colunas em inglês, `snake_case`, singular (`order_item`) | — |
| Chave primária | `id BINARY(16)` com UUIDv7 gerado na aplicação | ADR-0004 |
| Tenancy | Toda tabela operacional tem `store_id NOT NULL`; cadastros compartilhados por empresa têm `company_id` | ADR-0009 |
| Dinheiro | `BIGINT` em centavos, sufixo `_cents` (sinal permitido só em movimentações) | ADR-0003 |
| Custo unitário de insumo | `DECIMAL(18,6)` em reais por unidade base (precisão de micro-real) | ADR-0003 |
| Percentual | `INT` em pontos-base, sufixo `_bp` (10% = 1000) | ADR-0003 |
| Quantidade | `DECIMAL(14,3)` na unidade base | — |
| Datas/horas | `DATETIME(3)` em UTC; sufixo `_at` | ADR-0013 |
| Dia operacional | `DATE` `operational_date` gravado na escrita | ADR-0013 |
| Concorrência | `version INT UNSIGNED NOT NULL DEFAULT 0` nos agregados concorridos | ADR-0008 |
| Auditoria de linha | `created_at`, `updated_at` em todas as tabelas; `created_by` quando for ação de usuário | — |
| Soft delete | `deleted_at` apenas em `user`, `product`, `ingredient` (e `category`, `modifier` por histórico) | — |
| Enums | `ENUM` do MySQL para estados estáveis; tabela de referência quando o usuário puder criar valores | — |
| Proibido | `FLOAT`, `DOUBLE`, `TIMESTAMP` (limite 2038), FK com `ON DELETE CASCADE` em dado de negócio | — |
| Charset | `utf8mb4` / `utf8mb4_0900_ai_ci`; `sql_mode` estrito | — |

## 2. Entidades por módulo

Notação: **PK**, FK →, *UQ* = único, *IX* = índice, *CK* = check.

### 2.1 Organizations

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `organization` | id, name, status | PK id |
| `company` | id, organization_id, legal_name, trade_name, cnpj CHAR(14) NULL (opcional — E3-3), status, version | FK → organization; *UQ* cnpj |
| `store` | id, organization_id, company_id, name, code, timezone VARCHAR(64) (`America/Sao_Paulo`), operational_day_cutoff TIME (`05:00`), service_fee_bp INT (1000), negative_stock_policy ENUM(`PERMITIR_COM_ALERTA`,`BLOQUEAR`), max_open_cash_sessions SMALLINT (1 — Q-05), status, version | FK → company; *UQ* (company_id, code); *CK* service_fee_bp ≤ 10000; *CK* max_open_cash_sessions 1–20 |
| `terminal` | id, organization_id, store_id, code, name, kind ENUM(`CAIXA`,`KDS`,`MOVEL`), device_id NULL, active, version | FK → organization; FK → store; FK → known_device (ON DELETE SET NULL); *UQ* (store_id, code); *UQ* (organization_id, device_id) |
| `kitchen_station` | id, store_id, name, is_default, default_store_id (calculada) | FK → store; *UQ* (store_id, name); *UQ* default_store_id (uma padrão por loja) |
| `store_sequence` | store_id, name, operational_date, value | PK (store_id, name, operational_date) — numeração de contas por dia (**Etapa 6** — E3-5) |

`terminal.device_id`: um aparelho (`known_device`, identificado pelo cookie de aparelho da Etapa 2)
é "registrado" como terminal por quem tem `terminals.manage` (ADMIN, GERENTE — E3-1). O terminal da
sessão é calculado a cada requisição pelo aparelho da sessão e pela loja ativa, nunca vem do
formulário (RN-ORG-09, RN-ORG-11). Implementado na Etapa 3 (migrations 0003 e 0004).
Obs.: a chave estrangeira de `device_id` faz o MySQL criar sozinho o índice
`terminal_device_id_known_device_id_fk`, que não aparece no snapshot do Drizzle — é esperado.

### 2.2 Auth, Authorization e Users

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `app_user` (implementado) | id, organization_id, name, username, password_hash, pin_hash NULL, status ENUM(`ATIVO`,`DESATIVADO`), must_change_password, failed_pin_attempts, pin_locked_at, password_changed_at, disabled_at, created_by, version | FK → organization; *UQ* username (**único no sistema** — login sem escolher empresa) |
| `user_session` (implementado) | id, user_id, token_hash CHAR(64), organization_id, active_store_id, device_id NULL, login_method ENUM(`PASSWORD`,`PIN`), idle_timeout_seconds, ip, user_agent, created_at, last_seen_at, expires_at, revoked_at, revoke_reason | *UQ* token_hash; *IX* (user_id, revoked_at); *IX* (device_id, revoked_at); *IX* expires_at |
| `known_device` (implementado) | id, token_hash CHAR(64), shared, created_at, last_seen_at | *UQ* token_hash — aparelho identificado por cookie próprio |
| `device_user` (implementado) | device_id, user_id, last_password_login_at | PK (device_id, user_id) — base da troca rápida |
| `elevated_grant` (implementado) | id, token_hash, store_id, permission_code, requester_user_id, requester_session_id, authorizer_user_id, created_at, expires_at, used_at | *UQ* token_hash — autorização do gerente, uso único, 60 s |
| `role` | id, organization_id NULL (NULL = perfil de sistema), code, name, max_discount_bp INT, is_system | *UQ* code (Etapa 2; perfis por organização exigirão revisar) |
| `permission` | code VARCHAR(64), description | PK code — catálogo semeado por migration |
| `role_permission` | role_id, permission_code | PK (role_id, permission_code) |
| `user_role_assignment` | id, user_id, role_id, scope_type ENUM(`ORGANIZATION`,`COMPANY`,`STORE`), scope_id, created_by | *UQ* (user_id, role_id, scope_type, scope_id); *IX* (scope_type, scope_id) |
| `rate_limit_bucket` | bucket_key VARCHAR(191), window_start DATETIME, hits INT | PK (bucket_key, window_start) |

Perfis futuros (`SUPERVISOR`, `BAR`, `ESTOQUISTA`...) são apenas novas linhas em `role` —
nenhuma migration de estrutura.

### 2.3 Audit e infraestrutura transversal

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `audit_log` | id, organization_id, store_id NULL, event VARCHAR(64), actor_user_id, authorizer_user_id NULL, entity_type, entity_id, before_data JSON, after_data JSON, ip, user_agent, terminal_id NULL, request_id, occurred_at | *IX* (store_id, occurred_at); *IX* (entity_type, entity_id); *IX* (store_id, event, occurred_at) |
| `idempotency_record` | store_id, idem_key VARCHAR(64), operation VARCHAR(64), request_hash CHAR(64), response JSON, created_at | PK (store_id, idem_key); *IX* created_at (limpeza) |

`audit_log` é **somente insert**: o usuário MySQL da aplicação não recebe `UPDATE`/`DELETE`
nessa tabela (garantia no banco, não só no código).

### 2.4 Catalog

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `category` | id, company_id, name, sort_order, active, deleted_at | *UQ* (company_id, name) |
| `product` | id, company_id, category_id, name, sku NULL, description, sale_unit ENUM(`UN`,`KG`), requires_preparation BOOL, active, deleted_at | FK → category; *UQ* (company_id, sku) |
| `product_store` | product_id, store_id, price_cents, available BOOL, station_id NULL, version | PK (store_id, product_id); FK → kitchen_station; *CK* price_cents ≥ 0 |
| `modifier_group` | id, company_id, name, min_select, max_select | *CK* min ≤ max |
| `modifier` | id, modifier_group_id, name, price_delta_cents, active, deleted_at | FK → modifier_group |
| `product_modifier_group` | product_id, modifier_group_id, sort_order | PK (product_id, modifier_group_id) |

`active` = produto existe no cardápio; `available` = disponível agora nesta loja (acabou,
fora de horário). Produto inativo ou indisponível não pode ser lançado; itens já lançados não mudam.

### 2.5 Inventory e Recipes

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `ingredient` | id, company_id, name, base_unit ENUM(`g`,`ml`,`un`), active, deleted_at | *UQ* (company_id, name) |
| `ingredient_unit_conversion` | id, ingredient_id, unit_code VARCHAR(16), factor_to_base DECIMAL(14,3) | *UQ* (ingredient_id, unit_code); *CK* factor > 0 |
| `ingredient_stock` | store_id, ingredient_id, quantity DECIMAL(14,3), avg_unit_cost DECIMAL(18,6), min_quantity DECIMAL(14,3), version | PK (store_id, ingredient_id) |
| `stock_movement` | id, store_id, ingredient_id, type ENUM(`ENTRADA`,`SAIDA`,`AJUSTE`,`PERDA`,`CONSUMO_VENDA`,`ESTORNO_VENDA`), quantity DECIMAL(14,3) (com sinal), unit_cost DECIMAL(18,6), balance_after DECIMAL(14,3), origin_type, origin_id NULL, reason NULL, user_id, occurred_at, operational_date | *IX* (store_id, ingredient_id, occurred_at); *IX* (store_id, operational_date, type); *IX* (origin_type, origin_id) |
| `recipe` | id, company_id, product_id, version, updated_by | *UQ* product_id |
| `recipe_item` | id, recipe_id, ingredient_id, quantity DECIMAL(14,3) | *UQ* (recipe_id, ingredient_id); *CK* quantity > 0 |

Conversões universais (kg→g ×1000, L→ml ×1000) são constantes testadas no código
(`shared/units`); `ingredient_unit_conversion` guarda apenas as específicas ("caixa = 12 un").
Saldo e movimentação são gravados **na mesma transação**; `balance_after` permite auditoria do extrato.

### 2.6 Tables

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `dining_table` | id, store_id, number VARCHAR(10), area VARCHAR(40) NULL, capacity, status ENUM(`LIVRE`,`OCUPADA`,`AGUARDANDO_CONTA`,`EM_PAGAMENTO`,`LIMPEZA`), current_order_id NULL, active, version | *UQ* (store_id, number); *IX* (store_id, status); FK current_order_id → order |

Juntar mesas: as mesas passam a apontar para a **mesma** `current_order_id` (itens da conta
de origem são movidos; a conta de origem é encerrada como `CANCELADO` com motivo `MESCLADA`
e sem valor). Uma mesa tem no máximo uma conta aberta por construção (uma coluna).

### 2.7 Orders e Kitchen

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `order` (nome físico `customer_order`) | id, store_id, number, type ENUM(`MESA`,`BALCAO`), status ENUM(`ABERTO`,`FECHADO`,`CANCELADO`), label NULL, guests_count, opened_by, opened_at, closed_by, closed_at, cancel_reason, operational_date NULL (definida no fechamento), subtotal_cents, items_discount_cents, order_discount_cents, service_fee_bp, service_fee_cents, service_fee_removed_by NULL, total_cents, paid_cents, version | *UQ* (store_id, operational_date, number); *IX* (store_id, status); *IX* (store_id, operational_date, status) |
| `order_round` | id, store_id, order_id, number, sent_by, sent_at | *UQ* (order_id, number) |
| `order_item` | id, store_id, order_id, round_id NULL, product_id, product_name, unit_price_cents, quantity DECIMAL(14,3), modifiers_cents, discount_cents, notes, status ENUM(`PENDENTE`,`ENVIADO`,`EM_PREPARO`,`PRONTO`,`ENTREGUE`,`CANCELADO`), station_id NULL, kitchen_ticket_id NULL, created_by, sent_at, started_at, ready_at, delivered_at, cancelled_at, cancelled_by, cancel_authorized_by, cancel_reason, stock_consumed BOOL | *IX* (order_id, status); *IX* (store_id, status, sent_at); *IX* (kitchen_ticket_id); *CK* quantity > 0 |
| `order_item_modifier` | id, order_item_id, modifier_id, name, price_delta_cents, quantity | FK → order_item |
| `kitchen_ticket` | id, store_id, order_id, round_id, station_id, status ENUM(`NOVO`,`EM_PREPARO`,`PRONTO`,`CANCELADO`), created_at, started_at, ready_at, version | *UQ* (round_id, station_id); *IX* (store_id, station_id, status, created_at) |

Snapshot no item: `product_name`, `unit_price_cents` e adicionais são **congelados** no lançamento.
`order` é palavra reservada no MySQL — nome físico `customer_order`.
Itens sem preparo (`requires_preparation = false`, ex.: refrigerante) não geram ticket de KDS
(pergunta Q-08).

### 2.8 Cashier e Payments

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `cash_session` | id, store_id, terminal_id, status ENUM(`ABERTA`,`FECHADA`), operational_date, opened_by, opened_at, opening_amount_cents, closed_by, closed_at, version, open_terminal_id (coluna gerada: `IF(status='ABERTA', terminal_id, NULL)`) | *UQ* open_terminal_id → **no máximo uma sessão aberta por terminal**; *IX* (store_id, operational_date) |
| `cash_session_count` | cash_session_id, payment_method, expected_cents, declared_cents, difference_cents | PK (cash_session_id, payment_method) — fechamento cego por método |
| `cash_movement` | id, store_id, cash_session_id, type ENUM(`VENDA`,`SANGRIA`,`SUPRIMENTO`,`AJUSTE`,`ESTORNO`), payment_method, amount_cents (com sinal), payment_id NULL, reason NULL, user_id, authorized_by NULL, occurred_at | *IX* (cash_session_id, type); *UQ* (payment_id, type) |
| `payment` | id, store_id, order_id, cash_session_id, method ENUM(`DINHEIRO`,`PIX`,`CARTAO_CREDITO`,`CARTAO_DEBITO`,`OUTRO`), amount_cents, tendered_cents NULL, change_cents, status ENUM(`CONFIRMADO`,`CANCELADO`), provider VARCHAR(32) (`MANUAL`), provider_reference NULL, idempotency_key VARCHAR(64), created_by, cancelled_by, cancel_authorized_by, cancel_reason | *UQ* (store_id, idempotency_key); *IX* (order_id); *IX* (cash_session_id, method); *CK* amount_cents > 0; *CK* change só com DINHEIRO |
| `payment_allocation` | payment_id, order_item_id, amount_cents | PK (payment_id, order_item_id) — divisão por itens |

Divisão por valor e por pessoas = vários `payment` na mesma conta (a UI calcula as partes;
o servidor valida que a soma não excede o saldo). Divisão por itens usa `payment_allocation`.

### 2.9 Finance (básico)

| Tabela | Colunas principais | Chaves e constraints |
|---|---|---|
| `finance_category` | id, company_id, type ENUM(`RECEITA`,`DESPESA`), name, active | *UQ* (company_id, type, name) |
| `finance_entry` | id, store_id, type, category_id, description, amount_cents, competence_date, due_date NULL, paid_at NULL, status ENUM(`PREVISTO`,`PAGO`,`CANCELADO`), source ENUM(`MANUAL`,`CAIXA`), cash_session_id NULL, payment_method NULL, created_by | *UQ* (cash_session_id, payment_method); *IX* (store_id, competence_date, type) |

Receitas de venda são geradas **no fechamento do caixa** (uma por método de pagamento da sessão).

## 3. Cardinalidades principais

- Organization 1—N Company 1—N Store 1—N Terminal / KitchenStation / DiningTable.
- User N—N Role via `user_role_assignment` com escopo (papéis diferentes por loja).
- Product 1—N ProductStore (preço por loja); Product 1—0..1 Recipe 1—N RecipeItem N—1 Ingredient.
- Ingredient 1—N IngredientStock (um por loja) 1—N StockMovement.
- DiningTable N—0..1 Order (aberta); Order 1—N OrderRound 1—N OrderItem; Order 1—N KitchenTicket 1—N OrderItem.
- Terminal 1—N CashSession (no máximo 1 aberta) 1—N CashMovement; CashSession 1—N Payment N—1 Order.
- CashSession 1—N FinanceEntry (receitas consolidadas).

## 4. Índices por tela crítica

| Tela / consulta | Índice |
|---|---|
| Mapa de mesas | `dining_table (store_id, status)` + PK de `customer_order` |
| Comanda | `order_item (order_id, status)` |
| KDS (fila) | `kitchen_ticket (store_id, station_id, status, created_at)` |
| Polling com cursor | `updated_at` incluído nos índices de `kitchen_ticket` e `dining_table` (definir na Etapa 6/7 com `EXPLAIN`) |
| Pagamento idempotente | `payment (store_id, idempotency_key)` |
| Caixa aberto do terminal | `cash_session (open_terminal_id)` |
| Relatório de vendas | `customer_order (store_id, operational_date, status)`; `payment (cash_session_id, method)` |
| Extrato de estoque | `stock_movement (store_id, ingredient_id, occurred_at)` |
| Auditoria | `audit_log (store_id, occurred_at)`, `(entity_type, entity_id)` |
