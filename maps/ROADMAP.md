# Roadmap do MVP

Grafo de dependências: [roadmap/etapas.md](roadmap/etapas.md).
Cada etapa termina com gate: entregáveis, Definition of Done, `PROJECT_STATUS.md` atualizado e **aprovação explícita**.

| Etapa | Nome | Conteúdo | Depende de | Ajuste proposto na Fase 0 |
|---|---|---|---|---|
| 0 | Fase 0 | Análise, arquitetura, ADRs, sem código | — | — |
| 1 | Fundação | Next.js, TS strict, Drizzle, migrations, MySQL em Docker, lint, typecheck, Vitest, Testcontainers, Playwright, CI, padrão de erro, logger, `/health`, `/ready`, seed | 0 | **+ kernel compartilhado**: `Money`, `UnitCost`, `Quantity`, `Percentage`, `Clock`, UUIDv7, `DomainError`, `UnitOfWork`, infraestrutura de idempotência, regras de fronteira de módulos no lint |
| 2 | Identidade e acesso | Login/logout, sessão, usuários, RBAC com escopo, autorização elevada (PIN), rate limit, auditoria | 1 | Auditoria com grant somente-insert no banco |
| 3 | Organização e contexto | Organization/Company/Store/Terminal, usuários por loja, troca de loja, configurações (timezone, cutoff do dia operacional, taxa de serviço, política de estoque negativo), registro de dispositivo como terminal, estação de cozinha padrão | 2 | **+ cutoff do dia operacional** e **registro de dispositivo** |
| 4 | Catálogo | Categorias, produtos, preço por loja, adicionais, ativo/inativo, disponibilidade, flag "requer preparo" | 3 | + flag `requires_preparation` (Q-08) |
| 5 | Estoque e ficha técnica | Insumos, unidades/conversões, saldo por loja, movimentações, mínimo, ficha técnica, custo teórico/CMV, **serviço de consumo** exposto como caso de uso público | 4 | Serviço de consumo pronto para ser chamado pela Etapa 6 (se ADR-0006 = A) ou 8 (se = B) |
| 6 | Salão, mesas e pedidos | Cadastro e mapa de mesas, estados, abrir/transferir/juntar, balcão, comanda eletrônica, rodadas, itens, observações, cancelamento com aprovação, idempotência no envio, consumo de estoque (se A) | 4, 5 | Entregue em **6A (mesas)** e **6B (pedidos)** com checkpoint interno (risco R-14) |
| 7 | KDS | Estação única (modelo multi-praça), tickets, fila, cronômetro, alertas, iniciar/pronto, polling (fila completa a cada 3 s) | 6 | — |
| 8 | PDV e caixa | Sessão por terminal, abertura, sangria, suprimento, fechamento cego, pré-conta impressa, taxa de serviço, descontos com limite, pagamentos múltiplos, divisão, troco, idempotência | 6, 7 | — |
| 9 | Financeiro, dashboard e relatórios | Receitas consolidadas no fechamento do caixa, despesas, fluxo de caixa, dashboard do dia operacional, relatórios de vendas/caixa/estoque/operação, **consulta de auditoria** (`audit.read`) | 8 | + tela de consulta de auditoria (a permissão existia, a tela não tinha etapa) |
| 10 | Estabilização e piloto | E2E do golden path, cenários de falha, carga leve, backup + restauração testada, deploy, manual de operação, **MVP Gate** | 9 | — |

## Justificativa dos ajustes
- **Kernel na Etapa 1:** Money/Quantity/Clock/idempotência são usados a partir da Etapa 2; construí-los
  com TDD uma vez evita implementações divergentes por módulo.
- **Cutoff e terminal na Etapa 3:** o dia operacional e o terminal são configuração da loja; as etapas 6–9 dependem deles.
- **Divisão da Etapa 6:** é a maior etapa (salão + pedidos + concorrência + consumo). O checkpoint interno
  reduz o tamanho de cada revisão sem mudar a ordem.
- **Auditoria na Etapa 9:** `audit.read` estava no RBAC sem tela correspondente.

A ordem das etapas do README foi **confirmada**; os ajustes são apenas de conteúdo.

## Pós-MVP
Recalculado após o MVP Gate com base no piloto. Referência de prioridades em
[docs/requirements/visao-e-escopo.md](../docs/requirements/visao-e-escopo.md#4-priorização-p0p3).
