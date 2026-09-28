# Estratégia de testes — SDD, BDD e TDD

## 1. Fluxo por funcionalidade

```text
SDD (docs/modules/<modulo>.md) → critérios de aceite → BDD (.feature) → TDD (Red → Green → Refactor)
→ implementação → integração → E2E → segurança → performance → review → documentação → mapas
```

Responsáveis: `domain-spec` (SDD + BDD) → `architect` (schema/ADR) → `qa` (testes vermelhos)
→ `backend` → `frontend` → `qa` (E2E) → `reviewer`.

## 2. Estrutura das especificações SDD

Template: [docs/modules/_TEMPLATE-SDD.md](../modules/_TEMPLATE-SDD.md). Seções obrigatórias:
objetivo, atores, regras de negócio (numeradas `RN-<MOD>-NN`), entidades, estados e transições,
fluxos, exceções, permissões, contratos, critérios de aceite (`CA-<MOD>-NN`), dependências e testes
previstos. Cada `CA` aponta para o(s) cenário(s) BDD e testes que o cobrem (rastreabilidade).

## 3. Pirâmide

| Nível | Ferramenta | O que cobre | Banco |
|---|---|---|---|
| Unit (domínio) | Vitest (+ fast-check) | Entidades, value objects, máquinas de estado, cálculo de conta, Money/Quantity, dia operacional | Nenhum |
| Unit (aplicação) | Vitest | Casos de uso com repositórios em memória **apenas** para orquestração e autorização | Nenhum |
| Integração | Vitest + Testcontainers MySQL 8.4 | Repositórios, transações, locking, idempotência, constraints, isolamento entre lojas | **MySQL real** |
| BDD | `.feature` em português executados na camada de aplicação (integração) e no E2E | Regras legíveis pelo gerente | MySQL real |
| E2E | Playwright (+ playwright-bdd) | Golden path, cenários de falha, viewports celular/tablet/desktop | MySQL real (compose) |

Proibido: SQLite ou mock de banco em teste de integração; remover/enfraquecer teste para passar CI.

## 4. TDD

Obrigatório nos domínios críticos: autenticação, autorização, pedidos, pagamentos, caixa,
estoque, ficha técnica, consumo e auditoria. Regras testadas no `domain/` sem React/Next.
Commits registram o ciclo (`test:` vermelho → `feat:` verde → `refactor:`).

Cobertura mínima (gate de CI, a partir da Etapa 2): 90% de linhas/branches em `domain/` e
`application/` dos módulos críticos; sem meta numérica para UI (coberta por E2E).

## 5. Suporte a testes

- `FakeClock` (relógio injetável) para KDS, expiração de sessão e virada do dia operacional.
- Factories por agregado (`aStore()`, `anOrder().withItems(...)`) em `tests/support`.
- Banco de integração (decidido na Etapa 1): **um container MySQL 8.4 por execução** da suíte
  (`tests/support/mysql-global-setup.ts`), migrations aplicadas como root e testes rodando com o
  usuário da aplicação (apenas DML). **Sem truncamento**: cada teste usa uma loja (`store_id`)
  própria gerada com `newId()`, o que isola os dados e ainda exercita o isolamento multi-tenant.
- E2E: banco `erp_e2e` no MySQL do compose; o Playwright aplica as migrations, compila e sobe o
  **servidor standalone de produção** antes dos testes.
- BDD: `.feature` em `tests/features/`. Na camada de domínio com `@amiceli/vitest-cucumber`
  (`loadFeature(..., { language: 'pt' })`, arquivos `*.feature.test.ts`); no navegador com
  `playwright-bdd` (passos em `tests/e2e/steps/`).
- Dados fictícios somente em seed de desenvolvimento e testes.

## 6. Cenários BDD principais (a detalhar nos SDDs)

| Módulo | Cenários |
|---|---|
| Auth | Login válido; senha errada; bloqueio por rate limit; usuário desativado; sessão expirada no meio da operação; logout revoga sessão |
| Authorization | Sem permissão → negado; loja B inacessível a usuário da loja A; gerente autoriza desconto acima do limite com PIN; anti-escalada de papel |
| Organizations | Troca de loja em 1 clique; configuração de taxa de serviço; política de estoque negativo |
| Catalog | Produto inativo não pode ser lançado; desativar produto não altera itens lançados; preço diferente por loja |
| Tables | Abrir mesa; transferir conta; juntar mesas; `AGUARDANDO_CONTA → OCUPADA` com auditoria; mesa em `LIMPEZA` volta a `LIVRE` |
| Orders | Lançar item com preço congelado; enviar rodada; remover item pendente; cancelar item enviado com motivo e autorização; edição simultânea (409); perda de conexão no envio (idempotência) |
| Kitchen | Ticket aparece no KDS; iniciar; pronto; alerta por tempo; item cancelado some da fila |
| Inventory | Entrada com conversão kg→g; perda; ajuste; estoque mínimo gera alerta; estoque insuficiente com `PERMITIR_COM_ALERTA` e com `BLOQUEAR` |
| Recipes | Custo teórico; CMV; consumo conforme ADR-0006; cancelamento antes do preparo (estorno) e depois (perda) |
| Cashier | Abrir caixa; não pagar sem caixa aberto; sangria; suprimento; fechamento cego com divergência; um caixa aberto por terminal |
| Payments | Pagamento PIX total (exemplo do README); misto PIX + dinheiro com troco; divisão por pessoas e por itens; pagamento duplicado; cancelamento de pagamento com autorização |
| Finance | Receita consolidada no fechamento do caixa; despesa com categoria; fluxo de caixa do período |
| Reports | Vendas do dia operacional incluindo venda às 01:30; ticket médio; relatório de divergências |
| Audit | Eventos gerados com autor e autorizador; audit_log não aceita UPDATE/DELETE |

## 7. Pipeline de CI

```text
lint → typecheck → unit → integration (MySQL) → e2e → verificação de dependências → build
```

Qualquer falha bloqueia merge na branch principal. Testes flaky são corrigidos, não desativados.
