# Ferramentas e bibliotecas

Versões exatas são fixadas no lockfile na Etapa 1 (última estável na data). Toda nova
dependência fora desta lista exige registro e aprovação.

Legenda de necessidade: **Obrigatória** (README), **Proposta** (depende de ADR),
**Quando necessária** (entra na etapa que precisar), **Não no MVP**.

## Núcleo

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| Node.js 24 LTS | Runtime | Suporte LTS até 2028 | Baixo | — | Grátis | Obrigatória (ADR-0011) |
| npm | Gerenciador de pacotes | Vem com o Node, `npm ci` reprodutível com `package-lock.json` | Baixo | Node | Grátis | Aprovada (D-3) |
| TypeScript 6.0 (strict + `noUncheckedIndexedAccess`) | Tipagem | Erros em compilação | TS 7 ainda sem suporte no typescript-eslint (D-1) | — | Grátis | Obrigatória |
| Next.js (App Router) | Framework fullstack | RSC, Server Actions, um deploy | Mudanças entre majors | React | Grátis | Obrigatória |
| React | UI | Padrão do Next | Baixo | — | Grátis | Obrigatória |
| MySQL 8.4 LTS | Banco | LTS, suporte longo | Baixo | Docker em dev | Grátis / gerenciado pago | Obrigatória |
| Drizzle ORM + drizzle-kit | ORM e migrations | SQL explícito, `FOR UPDATE`, tipos, leve | Projeto mais jovem que Prisma | mysql2 | Grátis | Proposta (ADR-0001) |
| mysql2 | Driver MySQL | Pool, prepared statements | Baixo | — | Grátis | Proposta |
| Zod | Validação | Uma fonte para tipo + validação | Baixo | — | Grátis | Obrigatória |

## UI

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| Tailwind CSS | Estilo | Consistência, sem CSS global | Baixo | PostCSS | Grátis | Obrigatória |
| shadcn/ui (Radix) | Componentes acessíveis | Código copiado para o repo, sem lock-in | Atualização manual | Radix, Tailwind | Grátis | Obrigatória |
| Lucide | Ícones | Consistente com shadcn | Baixo | — | Grátis | Aprovada |
| TanStack Query | Estado de servidor no cliente | Polling, retry, cache, invalidação | Baixo | React | Grátis | Proposta (ADR-0012) |
| TanStack Table | Grades e relatórios | Headless, paginação/ordenação | Baixo | React | Grátis | Quando necessária (Etapa 4+) |
| Recharts | Gráficos | Simples para dashboard | Bundle | React | Grátis | Quando necessária (Etapa 9) |
| React Hook Form + @hookform/resolvers | Formulários | Integra com Zod, poucas re-renderizações | Baixo | Zod | Grátis | Proposta |
| Zustand | Estado local complexo | Simples | Estado duplicado | React | Grátis | **Não no MVP** salvo necessidade |

## Segurança e infraestrutura de aplicação

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| @node-rs/argon2 | Hash Argon2id de senha e PIN | Binário nativo, sem compilação local | Binário por plataforma | — | Grátis | Proposta (ADR-0002) |
| Pino | Logs estruturados | JSON rápido, redaction nativa | Baixo | — | Grátis | Aprovada |
| uuid (v7) | IDs UUIDv7 | Ordenável no tempo, gerável no cliente | Baixo | — | Grátis | Proposta (ADR-0004) |
| @date-fns/tz + date-fns | Timezone e dia operacional | Funções puras, IANA tz | Baixo | — | Grátis | Proposta (ADR-0013) |

Rate limit: implementação própria em tabela MySQL (sem Redis) — ver ADR-0002.

## Testes e qualidade

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| Vitest | Unit e integração | Rápido, TS nativo | Baixo | — | Grátis | Obrigatória |
| Testcontainers (MySQL) | MySQL real nos testes | Sem mocks de banco | Exige Docker no CI | Docker | Grátis | Obrigatória |
| Playwright | E2E | Multi-browser, viewport móvel/tablet | Flakiness | — | Grátis | Obrigatória |
| playwright-bdd | Executar `.feature` no E2E | Gherkin em português executável | Acoplamento a Playwright | Playwright | Grátis | Aprovada (D-10) — usada junto com a outra ferramenta de BDD |
| @amiceli/vitest-cucumber | Executar `.feature` na camada de domínio/aplicação | BDD sem browser, rápido | Projeto pequeno | Vitest | Grátis | Aprovada (D-10) — usada junto com a outra ferramenta de BDD |
| fast-check | Testes de propriedade | Money/Quantity/arredondamento | Baixo | — | Grátis | Instalada |
| ESLint + typescript-eslint | Lint e fronteiras de camadas (`no-restricted-imports`) | Regras de tipo, `no-explicit-any` | Baixo | — | Grátis | Obrigatória |
| ~~eslint-plugin-boundaries~~ | — | — | — | — | — | **Descartada na Etapa 1**: exigiria `eslint-import-resolver-typescript`; a regra nativa cobre o mesmo |
| Prettier | Formatação | Diffs limpos | Baixo | — | Grátis | Instalada |
| commitlint + lefthook | Conventional Commits e verificações antes do commit/push | Histórico legível | Baixo | — | Grátis | Instalada (D-6) |
| `npm audit` + OSV-Scanner | Verificação de dependências | Vulnerabilidades conhecidas | Falsos positivos | Docker (OSV) | Grátis | Obrigatória (CI); exceções em `osv-scanner.toml` |

## CI/CD e operação

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| GitHub Actions | CI (`.github/workflows/ci.yml`) | Docker disponível no runner | Depende do host do repo | GitHub | Grátis (limites) | Aprovada (Q-11) |
| Docker / Docker Compose | MySQL dev e E2E; imagem de produção | Paridade de ambientes | Baixo | — | Grátis | Obrigatória |

## Versões instaladas (Etapa 1, 2026-09-28)

Fixadas com `save-exact` no `package.json`; o `package-lock.json` é a referência.

| Uso | Pacotes |
|---|---|
| Aplicação | next 16.3.6, react / react-dom 19.3.0, drizzle-orm 0.45.3, mysql2 3.24.4, zod 4.6.5, pino 10.3.1, uuid 14.0.2 |
| Linguagem e build | typescript 6.0.3, tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, drizzle-kit 0.31.11 |
| Testes | vitest 5.0.2, @vitest/coverage-v8 5.0.2, @testcontainers/mysql 12.1.0, @playwright/test 1.63.0, playwright-bdd 9.2.1, @amiceli/vitest-cucumber 8.0.0, fast-check 4.10.2 |
| Qualidade | eslint 10.11.0, @eslint/js 10.0.1, typescript-eslint 8.70.1, @next/eslint-plugin-next 16.3.6, eslint-plugin-react-hooks 7.1.1, eslint-config-prettier 10.1.8, globals 17.12.0, prettier 3.9.9 |
| Git | lefthook 2.1.14, @commitlint/cli 21.2.3, @commitlint/config-conventional 21.2.3 |
| Tipos | @types/node 24.19.0, @types/react 19.3.0, @types/react-dom 19.3.0 |

Pacotes complementares (tipos, plugins e presets) são partes obrigatórias das ferramentas aprovadas.
Evitados de propósito: `dotenv` e `tsx` — o Node 24 já lê `.env` (`--env-file`) e executa TypeScript.

## Skills do Claude Code (avaliadas em 2026-09-28, D-11)

Skills são instruções extras que o Claude carrega em tarefas específicas. Toda skill é **lida
por inteiro antes de entrar no projeto** (é conteúdo de terceiros que orienta o agente).

| Skill | Decisão | Motivo |
|---|---|---|
| `frontend-design` (anthropics/skills, Apache 2.0, commit `33375500`) | ✅ Instalada em `.claude/skills/frontend-design/` | Orienta identidade visual, tipografia, hierarquia, acessibilidade e textos da interface. Nas telas operacionais (comanda, KDS, PDV), rapidez de leitura e toque vencem a ousadia estética — ver `.claude/agents/frontend.md` |
| `find-skills` (vercel-labs) | ❌ Não adotada | Só busca/instala outras skills via `npx skills`, baixando conteúdo de terceiros; a avaliação é feita sob demanda |
| `prisma-database-setup` (prisma) | ❌ Não adotada | Configura Prisma; o projeto usa Drizzle (ADR-0001) — instruções conflitantes |
| `clerk-backend-api` (clerk) | ❌ Não adotada | Depende do Clerk (serviço pago de autenticação); o projeto usa sessão própria revogável (ADR-0002) e mantém os dados no próprio banco |

## Explicitamente fora do MVP

Redis, BullMQ, filas, workers, WebSockets, PWA offline, object storage, OpenTelemetry/tracing,
Auth.js (ver ADR-0002), Prisma (ver ADR-0001).
