# Matriz de permissões do MVP (proposta)

Modelo: `Role → Permission (resource.action) → Scope (organization | company | store)`.
✅ = concedida · ⚡ = pode **solicitar**; executa com autorização elevada de quem tem a permissão.

| Permissão | ADMIN | GERENTE | CAIXA | GARCOM | COZINHA |
|---|---|---|---|---|---|
| dashboard.read | ✅ | ✅ | ✅ | | |
| users.read | ✅ | ✅ | | | |
| users.create / users.update / users.disable | ✅ | ✅ (anti-escalada) | | | |
| stores.read | ✅ | ✅ | ✅ | ✅ | ✅ |
| stores.manage (empresa, lojas, configurações) | ✅ | | | | |
| terminals.manage (terminais e vínculo do aparelho — E3-1) | ✅ | ✅ | | | |
| products.read | ✅ | ✅ | ✅ | ✅ | ✅ |
| products.create / products.update (preço: vale **na loja do preço**) | ✅ | ✅ | | | |
| products.availability ("acabou"/"voltou" na loja — E4-1) | ✅ | ✅ | ✅ | | ✅ |
| tables.read | ✅ | ✅ | ✅ | ✅ | |
| tables.configure (cadastro de mesas — E6-2) | ✅ | ✅ | | | |
| tables.manage (estado da mesa: liberar LIMPEZA) | ✅ | ✅ | ✅ | ✅ | |
| orders.read | ✅ | ✅ | ✅ | ✅ | |
| orders.create / orders.update (abrir, lançar, enviar, transferir, juntar — Q-18) | ✅ | ✅ | ✅ | ✅ | |
| orders.cancel | ✅ | ✅ | ⚡ | ⚡ | |
| kds.read | ✅ | ✅ | | ✅ | ✅ |
| kds.manage | ✅ | ✅ | | | ✅ |
| cashier.read | ✅ | ✅ | ✅ | | |
| cashier.open / cashier.close / cashier.movement | ✅ | ✅ | ✅ | | |
| payments.create | ✅ | ✅ | ✅ | | |
| payments.cancel | ✅ | ✅ | ⚡ | | |
| discounts.apply (até `max_discount_bp` do perfil) | ✅ | ✅ | ✅ | ⚡ | |
| discounts.apply_above_limit | ✅ | ✅ | ⚡ | ⚡ | |
| inventory.read | ✅ | ✅ | | | ✅ |
| inventory.manage | ✅ | ✅ | | | |
| recipes.read | ✅ | ✅ | | | ✅ |
| recipes.manage | ✅ | ✅ | | | |
| finance.read / finance.manage | ✅ | ✅ | | | |
| reports.read | ✅ | ✅ | | | |
| audit.read | ✅ | ✅ | | | |

Observações:
- Q-18 (2026-09-30): o GARCOM transfere e junta mesas (`orders.update`), com auditoria.
- Remoção da taxa de serviço: `discounts.apply_above_limit` (proposta) + auditoria `SERVICE_FEE_REMOVED`.
- Reabrir conta: `payments.cancel` + autorização elevada.
- Anti-escalada: GERENTE não atribui `ADMIN` nem permissões que não possui.
- `stores.manage` para **empresa e cadastro de loja** exige perfil de organização (ou da empresa);
  para alterar uma loja, basta a permissão valer naquela loja (docs/modules/organizations.md §4).

```mermaid
flowchart LR
  U[User] -->|user_role_assignment| RA[Role @ Scope]
  RA --> R[Role]
  R -->|role_permission| P[Permission resource.action]
  RA --> S{Scope}
  S --> O[Organization]
  S --> C[Company]
  S --> ST[Store]
```
