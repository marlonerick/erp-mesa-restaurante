# ERD do MVP

Detalhe de colunas, índices e constraints: [docs/database/modelo-de-dados.md](../../docs/database/modelo-de-dados.md).
Diagrama dividido por área para legibilidade. PKs `id` são UUIDv7 `BINARY(16)`.

Tabelas já criadas por migration:
- Etapa 1: `idempotency_record` (FK para `store` adicionada na Etapa 3).
- Etapa 2: `organization`, `company`, `store` (mínimo), `app_user` (nome físico do "user"),
  `user_session`, `known_device`, `device_user`, `rate_limit_bucket`, `role`, `permission`,
  `role_permission`, `user_role_assignment`, `elevated_grant`, `audit_log` (com triggers de imutabilidade).
- Etapa 3: `terminal`, `kitchen_station`; configurações em `store`; `version` em `company`.
- Etapa 4: `category`, `product`, `product_store`, `modifier_group`, `modifier`,
  `product_modifier_group` (migration 0005 — docs/modules/catalog.md §9).
- Etapa 5: `ingredient`, `ingredient_unit_conversion`, `ingredient_stock`, `stock_movement`
  (imutável), `recipe`, `recipe_item` (migration 0006 — docs/modules/inventory.md, recipes.md).

As demais são o modelo planejado. Nomes da Etapa 2 prevalecem sobre o diagrama abaixo
(ex.: `session` → `user_session`; `terminal.device_id` → `known_device`).

## Organização, acesso e auditoria

```mermaid
erDiagram
  organization ||--o{ company : possui
  company ||--o{ store : possui
  store ||--o{ terminal : possui
  store ||--o{ kitchen_station : possui
  organization ||--o{ user : emprega
  user ||--o{ session : abre
  user ||--o{ user_role_assignment : recebe
  role ||--o{ user_role_assignment : atribuido
  role ||--o{ role_permission : concede
  permission ||--o{ role_permission : compoe
  store ||--o{ audit_log : registra
  store ||--o{ idempotency_record : "evita duplicidade"

  idempotency_record {
    binary store_id PK
    string idem_key PK
    string operation
    string request_hash
    json response
    datetime created_at
  }
  organization {
    binary id PK
    string name
  }
  company {
    binary id PK
    binary organization_id FK
    string cnpj UK
  }
  store {
    binary id PK
    binary company_id FK
    string timezone
    time operational_day_cutoff
    int service_fee_bp
    enum negative_stock_policy
    int max_open_cash_sessions
    int kds_warning_minutes
    int kds_late_minutes
    int version
  }
  terminal {
    binary id PK
    binary store_id FK
    string code
    enum kind
    binary device_id FK "known_device, único"
    bool active
  }
  kitchen_station {
    binary id PK
    binary store_id FK
    bool is_default
  }
  user {
    binary id PK
    binary organization_id FK
    string username
    string password_hash
    string pin_hash
    enum status
  }
  session {
    binary id PK
    binary user_id FK
    string token_hash UK
    binary active_store_id FK
    datetime expires_at
    datetime revoked_at
  }
  role {
    binary id PK
    string code
    int max_discount_bp
  }
  permission {
    string code PK
  }
  role_permission {
    binary role_id PK
    string permission_code PK
  }
  user_role_assignment {
    binary id PK
    binary user_id FK
    binary role_id FK
    enum scope_type
    binary scope_id
  }
  audit_log {
    binary id PK
    binary store_id FK
    string event
    binary actor_user_id
    binary authorizer_user_id
    string request_id
    datetime occurred_at
  }
```

## Catálogo, estoque e ficha técnica

```mermaid
erDiagram
  category ||--o{ product : agrupa
  product ||--o{ product_store : "preco por loja"
  store ||--o{ product_store : vende
  company ||--o{ category : "cardapio da empresa"
  company ||--o{ modifier_group : possui
  modifier_group ||--o{ modifier : contem
  product ||--o{ product_modifier_group : oferece
  modifier_group ||--o{ product_modifier_group : "usado em"
  product ||--o| recipe : "ficha tecnica"
  modifier ||--o| recipe : "ficha do adicional (Q-09)"
  company ||--o{ ingredient : "insumos da empresa"
  recipe ||--o{ recipe_item : contem
  ingredient ||--o{ recipe_item : "usado em"
  ingredient ||--o{ ingredient_unit_conversion : converte
  ingredient ||--o{ ingredient_stock : "saldo por loja"
  store ||--o{ ingredient_stock : mantem
  ingredient ||--o{ stock_movement : movimenta
  store ||--o{ stock_movement : registra

  category {
    binary id PK
    binary company_id FK
    string name "UK por empresa"
    int sort_order
    bool active
    int version
  }
  product {
    binary id PK
    binary company_id FK
    binary category_id FK
    string name "UK por empresa"
    string sku "UK por empresa, opcional"
    bool requires_preparation
    bool active
    int version
  }
  product_store {
    binary store_id PK
    binary product_id PK
    int price_cents "0 a 9999999"
    bool available
    int version
  }
  modifier_group {
    binary id PK
    binary company_id FK
    int min_select
    int max_select
    bool active
    int version
  }
  modifier {
    binary id PK
    binary modifier_group_id FK
    int price_delta_cents "unico na empresa (Q-09)"
    bool active
    int version
  }
  recipe {
    binary id PK
    binary company_id FK
    binary product_id FK "UK, ou"
    binary modifier_id FK "UK (exatamente um)"
    int version
  }
  recipe_item {
    binary id PK
    binary recipe_id FK
    binary ingredient_id FK
    decimal quantity
  }
  ingredient {
    binary id PK
    binary company_id FK
    string name "UK por empresa"
    enum base_unit "imutavel"
    bool active
    int version
  }
  ingredient_unit_conversion {
    binary id PK
    binary ingredient_id FK
    string unit_name
    decimal factor_to_base
  }
  ingredient_stock {
    binary store_id PK
    binary ingredient_id PK
    decimal quantity
    decimal avg_unit_cost
    decimal min_quantity
    int version
  }
  stock_movement {
    binary id PK
    binary store_id FK
    binary ingredient_id FK
    enum type
    decimal quantity
    decimal unit_cost
    bigint value_cents
    decimal balance_after
    enum loss_reason
    enum origin_type
    binary origin_id
    date operational_date "imutavel (triggers)"
  }
```

## Salão, pedidos, cozinha, caixa, pagamentos e financeiro

```mermaid
erDiagram
  store ||--o{ store_sequence : "numero da conta por dia"
  store ||--o{ dining_table : possui
  dining_table }o--o| customer_order : "conta aberta"
  customer_order ||--o{ order_round : "rodadas"
  customer_order ||--o{ order_item : contem
  order_round ||--o{ order_item : envia
  order_item ||--o{ order_item_modifier : adicionais
  order_round ||--o{ kitchen_ticket : gera
  kitchen_station ||--o{ kitchen_ticket : recebe
  kitchen_ticket ||--o{ order_item : agrupa
  terminal ||--o{ cash_session : opera
  cash_session ||--o{ cash_movement : registra
  cash_session ||--o{ cash_session_count : "fechamento cego"
  cash_session ||--o{ payment : recebe
  customer_order ||--o{ payment : "paga por"
  payment ||--o{ payment_allocation : "divisao por itens"
  order_item ||--o{ payment_allocation : "alocado em"
  payment ||--o| cash_movement : "gera VENDA"
  cash_session ||--o{ finance_entry : "receita consolidada"
  finance_category ||--o{ finance_entry : classifica

  dining_table {
    binary id PK
    binary store_id FK
    string number
    string area
    int seats
    enum status
    binary current_order_id FK
    int version
  }
  customer_order {
    binary id PK
    binary store_id FK
    int number
    date opened_date
    date closed_date
    enum type
    enum status
    string label
    binary merged_into_order_id
    int service_fee_bp
    int discount_cents
    int paid_cents
    int total_cents
    int version
  }
  order_round {
    binary id PK
    binary order_id FK
    int number
  }
  order_item {
    binary id PK
    binary order_id FK
    binary round_id FK
    binary kitchen_ticket_id FK
    string product_name
    int unit_price_cents
    int modifiers_cents
    int quantity
    enum status
    binary started_by FK
    binary ready_by FK
    bool stock_consumed
    int discount_cents
  }
  kitchen_ticket {
    binary id PK
    binary round_id FK
    binary station_id FK
    enum status
    datetime finished_at
    int version
  }
  cash_session {
    binary id PK
    binary terminal_id FK
    enum status
    date operational_date
    binary open_terminal_id UK
    int version
  }
  cash_movement {
    binary id PK
    binary cash_session_id FK
    enum type
    enum payment_method
    int amount_cents
    binary payment_id FK
  }
  payment {
    binary id PK
    binary order_id FK
    binary cash_session_id FK
    enum method
    int amount_cents
    int change_cents
    enum status
  }
  payment_allocation {
    binary payment_id PK
    binary order_item_id PK
    int amount_cents
  }
  cash_session_count {
    binary cash_session_id PK
    enum payment_method PK
    int expected_cents
    int declared_cents
    int difference_cents
  }
  finance_category {
    binary id PK
    binary company_id FK
    enum type
    string name
    string system_code UK
    bool active
  }
  finance_entry {
    binary id PK
    binary store_id FK
    binary category_id FK
    enum type
    int amount_cents
    date competence_date
    date due_date
    date paid_date
    enum status
    enum source
    binary cash_session_id FK
    enum payment_method
    int version
  }
```
