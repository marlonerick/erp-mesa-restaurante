# Ferramentas e bibliotecas

Versões exatas são fixadas no lockfile na Etapa 1 (última estável na data). Toda nova
dependência fora desta lista exige registro e aprovação.

Legenda de necessidade: **Obrigatória** (README), **Proposta** (depende de ADR),
**Quando necessária** (entra na etapa que precisar), **Não no MVP**.

## Núcleo

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| Node.js 24 LTS | Runtime | Suporte LTS até 2028 | Baixo | — | Grátis | Obrigatória (ADR-0011) |
| pnpm | Gerenciador de pacotes | Lockfile estrito, rápido, evita dependências fantasmas | Baixo | Node | Grátis | Proposta |
| TypeScript (strict + `noUncheckedIndexedAccess`) | Tipagem | Erros em compilação | Baixo | — | Grátis | Obrigatória |
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
| playwright-bdd | Executar `.feature` no E2E | Gherkin em português executável | Acoplamento a Playwright | Playwright | Grátis | Proposta |
| @amiceli/vitest-cucumber | Executar `.feature` na camada de domínio/aplicação | BDD sem browser, rápido | Projeto pequeno | Vitest | Grátis | Proposta (validar na Etapa 1; alternativa: cenários BDD espelhados em `describe` com link ao `.feature`) |
| fast-check | Testes de propriedade | Money/Quantity/arredondamento | Baixo | — | Grátis | Proposta |
| ESLint + typescript-eslint | Lint | Regras de tipo, `no-explicit-any` | Baixo | — | Grátis | Obrigatória |
| eslint-plugin-boundaries | Fronteiras de camadas/módulos | Impede import proibido | Configuração inicial | ESLint | Grátis | Proposta |
| Prettier | Formatação | Diffs limpos | Baixo | — | Grátis | Proposta |
| commitlint + husky/lefthook | Conventional Commits | Histórico legível | Baixo | — | Grátis | Proposta |
| `pnpm audit` + OSV-Scanner | Verificação de dependências | Vulnerabilidades conhecidas | Falsos positivos | — | Grátis | Obrigatória (CI) |

## CI/CD e operação

| Nome | Objetivo | Benefício | Risco | Dependências | Custo | Necessidade |
|---|---|---|---|---|---|---|
| GitHub Actions | CI | Docker disponível no runner | Depende do host do repo | GitHub | Grátis (limites) | Proposta (pergunta Q-11) |
| Docker / Docker Compose | MySQL dev e E2E; imagem de produção | Paridade de ambientes | Baixo | — | Grátis | Obrigatória |

## Explicitamente fora do MVP

Redis, BullMQ, filas, workers, WebSockets, PWA offline, object storage, OpenTelemetry/tracing,
Auth.js (ver ADR-0002), Prisma (ver ADR-0001).
