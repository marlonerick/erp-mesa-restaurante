# Etapa 1 — Fundação

Ramo: `etapa-01-fundacao`. Plano aprovado em 2026-09-28 (decisões D-1 a D-7).

## Objetivo
Deixar pronta a base técnica sobre a qual todos os módulos serão construídos: projeto, qualidade
automática, banco, núcleo de tipos de valor, transações, idempotência, erros, logs e testes.

## Escopo entregue

| Bloco | Entrega |
|---|---|
| 1. Repositório | `.gitattributes` (LF), `.editorconfig`, `.nvmrc` (24), `.npmrc` (versões exatas), lefthook + commitlint |
| 2. Next.js | Next 16.3 + React 19.3 + Tailwind 4, App Router em `src/`, `output: standalone`, página provisória |
| 3. Qualidade | TS 6 estrito (D-1, D-7), ESLint `strict-type-checked`, Prettier, fronteiras de camadas |
| 4. MySQL local | MySQL 8.4 em Docker, UTC, utf8mb4, modo estrito; usuários `erp_app` (DML) e `erp_migrator` (DDL); bancos `erp_dev` e `erp_e2e` |
| 5. Configuração | Variáveis de ambiente validadas com Zod (falha rápida, sem expor valores) |
| 6. Kernel | `Money`, `UnitCost`, `Quantity` + conversões, `Percentage`, `Id` (UUIDv7), `Clock`, `DomainError` |
| 7. Banco | Pool mysql2 + Drizzle 0.45, `runInTransaction` com retentativa em deadlock, UUID em `BINARY(16)`, idempotência, migration `0000_idempotency_record` |
| 8. Erros e logs | Padrão público de erro, `ActionResult`, logger Pino com máscara, `requestId` no `proxy.ts`, cabeçalhos de segurança |
| 9. Saúde | `/health` e `/ready` (200/503) |
| 10. Testes | Vitest (unit + integração com Testcontainers), Playwright em 3 telas, BDD em português nas duas camadas, testes de arquitetura, esqueleto do seed |
| 11. CI e docs | `.github/workflows/ci.yml`, OSV-Scanner, este documento, guia `docs/deployment/dev-setup.md` |

## Fora do escopo (mantido)
Login, usuários, tabelas e telas de negócio; CSP completa; deploy/staging; `git push`.

## Desvios do plano (registrados)

| Plano | O que foi feito | Motivo |
|---|---|---|
| `create-next-app` | Arquivos do Next escritos à mão | A ferramenta recusa pasta com `README.md` e gera exemplos que seriam apagados |
| `eslint-plugin-boundaries` | Regra nativa `no-restricted-imports` + teste que prova o bloqueio | O plugin exigiria mais uma dependência (`eslint-import-resolver-typescript`) |
| `Result` no kernel | Não criado | Os casos de uso usam `DomainError`; o retorno para a UI é `ActionResult`. Criar só quando houver uso |
| `docker/mysql/conf.d/my.cnf` | Opções na linha de comando do compose | No Windows o MySQL ignora `.cnf` montado (aparece como gravável por todos) |
| `next start` | `node .next/standalone/server.js` (+ `scripts/prepare-standalone.ts`) | Com `output: standalone` o `next start` não é o servidor de produção real |
| Manter só uma ferramenta de BDD | As duas foram mantidas (**aprovado pelo usuário, D-10**) | Cada uma cobre uma camada (domínio × navegador) |

## Banco
- Migration `drizzle/0000_idempotency_record.sql` (revisada): PK `(store_id, idem_key)`, índice em `created_at`.
  FK para `store` entra na Etapa 3 (D-4).
- Datas em UTC; `DECIMAL`/`BIGINT` trafegam como texto (sem float — ADR-0003).

## Segurança
- Usuário da aplicação sem DDL (testado: `CREATE TABLE` falha com erro 1142).
- Logs mascaram senha, PIN, hashes, token, cookie, set-cookie, authorization, CPF (testado) e
  removem os parâmetros das consultas SQL dos erros de banco (testado).
- Toda conexão força a sessão do MySQL em UTC (testado com servidor em -03:00).
- MySQL de desenvolvimento acessível só pela própria máquina (`127.0.0.1`) e imagem fixada por digest;
  ações do GitHub fixadas por SHA.
- Erro inesperado nunca expõe stack/SQL (testado).
- Vulnerabilidade aceita e documentada: GHSA-67mh-4wv8-2f99 (esbuild, só desenvolvimento).
- `npm audit --omit=dev`: 0 vulnerabilidades. OSV-Scanner: nenhuma pendência.

## Testes (resultado em 2026-09-28)

| Tipo | Quantidade | Resultado |
|---|---|---|
| Unitários + integração com MySQL 8.4 real (inclui propriedades, BDD de domínio e arquitetura) | 16 arquivos | ✅ |
| **Total Vitest** | **197 testes** | ✅ todos passando |
| E2E + BDD no navegador (celular, tablet, desktop) | 10 testes | ✅ todos passando |
| Cobertura do kernel | 96,8% linhas / 96,3% ramos | ✅ meta ≥ 90% |

Destaques: dois envios simultâneos com a mesma chave executam a operação **uma única vez**;
retentativa automática em deadlock; divisão de conta sempre soma o total (testado com milhares de
valores sorteados); fronteiras de camadas bloqueadas (20 casos proibidos, 6 permitidos).

## Revisão do `reviewer` (2026-09-28)

Veredito: **aprovado com ressalvas, sem bloqueantes**. Todos os achados foram reproduzidos por
testes (23 testes novos, vermelhos antes da correção) e corrigidos:

| # | Achado | Correção |
|---|---|---|
| I-1 | Hash de idempotência tratava `Date` como `{}` e quebrava com `bigint` | Forma canônica com data/bigint marcados; tipos sem representação são recusados |
| I-2 | Comando sem retorno falhava; reenvio devolvia forma diferente da 1ª execução | Resultado sempre na forma JSON (`Jsonified<T>`), `undefined` vira `null` |
| I-3 | Log de erro de banco vazaria parâmetros SQL (hash de senha, PIN) | Serializador de erro remove `sql`/`params` e mascara `params:` na mensagem; máscara em 3 níveis + `set-cookie`, `secret`, tokens |
| I-4 | `/ready` respondia 500 com `.env` inválido | Logger independe do `.env`; `/ready` responde 503 |
| I-5 | Sessão MySQL não forçada em UTC; teste aceitava qualquer fuso | `SET time_zone = '+00:00'` em toda conexão; teste com servidor em -03:00 |
| I-6 | DoD marcada antes do tempo (mapa, CPF, revisão) | ERD atualizado, CPF testado, DoD marcada após as correções |
| S-1 | UUID inválido virava zeros no `BINARY(16)` | Validação antes de converter |
| S-2 | Domínio podia importar `shared/*` além do kernel; UI entrava no domínio por caminho relativo | Regras e testes novos |
| S-3 | Retentativa reexecuta a transação inteira (não documentado) | JSDoc + ADR-0008; isolamento explícito |
| S-4 | `multiplyBy` ignora unidade (teste enganoso) | Documentado; venda por peso fica para a Etapa 4 (Q-10) |
| S-5 | Teste de privilégio aceitava qualquer erro | Exige erro 1142 |
| S-7 | MySQL dev exposto à rede local | Porta só em `127.0.0.1`; imagem por digest |
| S-8 | Ações do CI presas só por etiqueta | Fixadas por SHA |
| S-6 | Falta teste com deadlock **real** (3 envios, o 1º desfeito) | **Pendente** — registrado como débito |

## Performance
Sem telas de negócio ainda. `/health` e `/ready` respondem em milissegundos no E2E.

## Critérios de aceite
- [x] lint, typecheck, unit, integração, E2E e build passando localmente
- [x] Kernel com ≥ 90% de cobertura (96,8%)
- [x] `/health` 200; `/ready` 200 com banco ligado e 503 com banco desligado
- [x] Teste prova que o lint bloqueia domínio importando React/ORM
- [x] CI pronto (roda quando o ramo for enviado ao GitHub)

## Riscos e pendências
- A esteira de CI roda no GitHub a partir do envio para a `main` (autorizado em 2026-09-28).
- Cobertura menor em `shared/http` e `shared/logger` (funções que leem o ambiente real, cobertas pelo E2E).

## Definition of Done
- [x] Entregáveis criados e testados
- [x] Documentação, mapas e `PROJECT_STATUS.md` atualizados
- [x] Revisão do `reviewer` e correção dos achados
- [x] `APROVADO` do usuário (2026-09-28) — BDD com as duas ferramentas (D-10); enviado direto na `main` (D-9)
