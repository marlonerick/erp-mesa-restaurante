# Arquitetura — visão geral

Diagrama: [maps/architecture/sistema.md](../../maps/architecture/sistema.md).
Dependências entre módulos: [maps/modules/dependencias.md](../../maps/modules/dependencias.md).

## 1. Estilo

**Monólito modular** em Next.js (App Router), um único processo Node, um banco MySQL.
Sem microserviços, filas ou cache distribuído no MVP. Cada módulo tem fronteira explícita
(casos de uso públicos) para que possa ser extraído no futuro se houver necessidade comprovada.

## 2. Camadas

| Camada | Responsabilidade | Pode depender de |
|---|---|---|
| `app/` (UI) | Rotas, layouts, páginas, composição de componentes. Sem regra de negócio | `interface/` do módulo, `ui/` |
| `interface/` | Server Actions e Route Handlers, DTOs Zod, montagem do `RequestContext`, mapeamento de erros | `application/` |
| `application/` | Casos de uso: autorização, orquestração, transação, auditoria | `domain/`, portas (interfaces) |
| `domain/` | Entidades, value objects, máquinas de estado, regras puras, erros de domínio | apenas `shared/kernel` |
| `infrastructure/` | Repositórios (Drizzle), provedores externos, implementações das portas | `domain/`, `application/` (portas), ORM |

Regra de dependência: setas apontam para dentro (`domain` não importa nada de fora).
Verificada automaticamente pela regra nativa `no-restricted-imports` do ESLint (`eslint.config.js`),
no commit e no CI; `tests/unit/architecture/boundaries.test.ts` prova que as importações proibidas
são bloqueadas. (Na Etapa 1 o `eslint-plugin-boundaries` foi descartado: exigiria mais uma
dependência só para resolver o atalho `@/`.)

## 3. Frontend

- React Server Components para leitura inicial; Client Components apenas onde há interação.
- Mutações por **Server Actions** (formulários e comandos) validadas com Zod no servidor.
- Estado de servidor no cliente: **TanStack Query** (polling do KDS e mapa de mesas,
  retry, invalidação). Zustand só com necessidade comprovada (ADR-0012).
- UI: Tailwind CSS + shadcn/ui + Lucide. Tabelas/relatórios: TanStack Table. Gráficos: Recharts.
- Alvos de tela: desktop (gerência/caixa), tablet (caixa/KDS), celular (garçom — comanda
  eletrônica), TV/monitor (KDS). Alvos de toque ≥ 44px, alto contraste no KDS.
- A UI esconde ações sem permissão, mas **nunca** é a barreira de segurança.

## 4. Backend

- Casos de uso recebem um `RequestContext` imutável:
  `{ requestId, sessionId, userId, organizationId, storeId, deviceId, terminalId, permissions, clock }`.
  `terminalId` é calculado pelo aparelho da sessão e pela loja ativa (Etapa 3, RN-ORG-11).
  O `storeId` vem **da sessão**, nunca do payload do cliente.
- Cada caso de uso: valida entrada (Zod na borda) → autoriza (`authorize(ctx, 'orders.create')`)
  → abre transação → carrega agregados com `version` → aplica regra de domínio → persiste →
  grava auditoria → commit → retorna DTO.
- Erros de domínio tipados (`DomainError` com `code`) mapeados para o padrão global de erro.
- Route Handlers apenas para: `/health`, `/ready`, endpoints de polling (KDS, mesas) e futuras
  integrações (webhooks). O restante é Server Action.

## 5. Banco

- MySQL 8.4 LTS, InnoDB, `utf8mb4_0900_ai_ci`, isolamento `REPEATABLE READ` (padrão).
- Migrations versionadas em SQL geradas pelo ORM e **revisadas** (ADR-0001). Nunca `push` em produção.
- Datas em UTC (`DATETIME(3)`), exibição no timezone da loja.
- Modelo: [docs/database/modelo-de-dados.md](../database/modelo-de-dados.md).

## 6. Consistência

- Uma transação por caso de uso, abrangendo todos os agregados afetados (ADR-0008).
- Eventos de domínio **em processo e síncronos dentro da transação** para acoplamento entre
  módulos (ex.: `PaymentRegistered` → Cashier registra `VENDA`). Sem outbox no MVP; outbox entra
  quando houver efeito externo (webhook, fiscal, PSP).
- Locking otimista (`version`) nos agregados concorridos; `SELECT ... FOR UPDATE` somente em
  pontos documentados (ex.: saldo de estoque dentro da transação de baixa).
- Idempotência em comandos críticos (envio de rodada, pagamento, abertura/fechamento de caixa).

## 7. Tempo real

Polling curto via TanStack Query (KDS: 3 s; mapa de mesas: 5 s; pausa quando a aba não está
visível) com cursor `since` para devolver apenas mudanças. SSE como evolução (ADR-0005).

## 8. Filas

**Não há filas no MVP.** Todas as operações do MVP são síncronas e curtas. Uma fila só entra
com documento de necessidade (problema, benefício, alternativas, complexidade, custo, riscos,
momento) — candidatos futuros: emissão fiscal, webhooks de iFood, envio de WhatsApp.

## 9. Integrações futuras

Portas (interfaces) definidas desde o início, com implementações manuais explícitas:

| Porta | Implementação no MVP | Futuro |
|---|---|---|
| `PaymentProvider` | `ManualConfirmationProvider` (caixa confirma PIX/cartão) | PSP PIX, TEF |
| `PrintService` | `BrowserPrintService` (HTML + `window.print`) | ESC/POS (agente local) |
| `FiscalProvider` | inexistente (não há chamada) | NFC-e/NF-e |
| `NotificationChannel` | inexistente | WhatsApp |

Ver [docs/integrations/integracoes-futuras.md](../integrations/integracoes-futuras.md).

## 10. Infraestrutura

- Desenvolvimento: Node 24 LTS local + MySQL 8.4 em Docker Compose.
- Testes: MySQL 8.4 via Testcontainers (integração) e Docker Compose (E2E).
- Produção (proposta, ADR-0011): container Node persistente (`next build` com `output: standalone`)
  + MySQL 8.4 gerenciado, ambos na região São Paulo; HTTPS; backup diário + binlog.
- Observabilidade: logs estruturados Pino (JSON) com `requestId`, `storeId`, `userId`;
  `/health` e `/ready`. Tracing só com necessidade comprovada.

## 11. Estrutura de diretórios completa

```text
erp-mesa-restaurante/
├── .claude/
│   └── agents/                     # architect, domain-spec, backend, frontend, qa, reviewer
├── .github/
│   └── workflows/ci.yml            # lint → typecheck → unit → integration → e2e → audit → build
├── docker/
│   ├── compose.dev.yml             # MySQL 8.4 dev
│   └── mysql/init/                 # cria usuários app (DML) e migrator (DDL); opções do MySQL
│                                   # vão na linha de comando do compose (no Windows, .cnf montado é ignorado)
├── docs/                           # ver docs/README.md
├── maps/                           # diagramas Mermaid
├── drizzle/                        # migrations SQL versionadas (geradas e revisadas)
├── public/
├── scripts/                        # migrate, seed de desenvolvimento, preparo do standalone, backup/restore
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/                  # área autenticada (layout com contexto de loja)
│   │   │   ├── dashboard/
│   │   │   ├── salao/              # mapa de mesas
│   │   │   ├── comanda/[orderId]/  # comanda eletrônica (celular)
│   │   │   ├── kds/
│   │   │   ├── pdv/                # caixa e pagamentos
│   │   │   ├── catalogo/
│   │   │   ├── estoque/
│   │   │   ├── fichas-tecnicas/
│   │   │   ├── financeiro/
│   │   │   ├── relatorios/
│   │   │   └── admin/              # empresa, lojas, terminais, usuários, perfis, configurações
│   │   ├── health/route.ts         # liveness (D-5)
│   │   ├── ready/route.ts          # readiness: banco respondendo (D-5)
│   │   ├── api/
│   │   │   └── poll/               # kds, tables (leituras com cursor)
│   │   └── layout.tsx
│   ├── modules/
│   │   ├── auth/                   # cada módulo: domain/ application/ infrastructure/ interface/
│   │   ├── authorization/
│   │   ├── users/
│   │   ├── organizations/          # organization, company, store, terminal, store settings
│   │   ├── catalog/
│   │   ├── tables/
│   │   ├── orders/
│   │   ├── kitchen/
│   │   ├── payments/
│   │   ├── cashier/
│   │   ├── inventory/
│   │   ├── recipes/
│   │   ├── finance/
│   │   ├── reports/                # somente leitura (query services)
│   │   └── audit/
│   ├── shared/
│   │   ├── kernel/                 # Money, UnitCost, Quantity (+ unidades), Percentage, Id, Clock, DomainError
│   │   ├── config/                 # variáveis de ambiente validadas (Zod)
│   │   ├── http/                   # requestId, readiness
│   │   ├── auth/                   # leitura da sessão, RequestContext
│   │   ├── rbac/                   # authorize(), catálogo de permissões
│   │   ├── audit/                  # porta AuditLogger
│   │   ├── db/                     # conexão, runInTransaction (unidade de trabalho), UUID binário, schema agregado
│   │   ├── errors/                 # mapeamento DomainError/Zod → resposta de erro, ActionResult
│   │   ├── idempotency/
│   │   ├── logger/                 # Pino + redaction
│   │   └── (dia operacional: kernel/operational-day.ts — Etapa 3)
│   ├── proxy.ts                    # Next 16 "proxy" (antigo middleware): requestId
│   └── ui/                         # componentes reutilizáveis (shadcn/ui + próprios)
├── tests/
│   ├── unit/                       # espelha src/modules/*/domain e application; architecture/ (fronteiras)
│   ├── integration/                # repositórios e casos de uso contra MySQL real
│   ├── e2e/                        # Playwright
│   ├── features/<modulo>/*.feature # BDD em português
│   └── support/                    # factories, fixtures, Testcontainers, FakeClock
├── .env.example
├── osv-scanner.toml                # exceções de vulnerabilidade aceitas, com justificativa
├── CLAUDE.md
└── README.md
```
