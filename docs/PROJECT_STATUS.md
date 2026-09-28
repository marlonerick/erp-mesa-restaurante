# Status do projeto

Última atualização: 2026-09-28

## Etapa atual
**Etapa 2 — Identidade e acesso** — próxima. O plano será apresentado para aprovação antes de começar.

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | **Aprovada** em 2026-09-28 (na `main`) |
| 2 | Identidade e acesso | Aguardando plano |
| 3 | Organização e contexto | Não iniciada |
| 4 | Catálogo | Não iniciada |
| 5 | Estoque e ficha técnica | Não iniciada |
| 6 | Salão, mesas e pedidos | Não iniciada |
| 7 | KDS | Não iniciada |
| 8 | PDV e caixa | Não iniciada |
| 9 | Financeiro básico, dashboard e relatórios | Não iniciada |
| 10 | Estabilização e piloto (MVP Gate) | Não iniciada |

## Concluído
- Etapa 0: documentação em `/docs`, diagramas em `/maps`, 6 subagentes, 13 ADRs
  (12 aceitos; ADR-0006 aguardando Q-01).
- Etapa 1: Next.js 16, TS 6 estrito, lint com fronteiras de camadas, MySQL 8.4 em Docker, kernel
  (Money, UnitCost, Quantity, Percentage, Id, Clock), transações, idempotência, padrão de erro,
  logger, requestId, `/health` e `/ready`, E2E, BDD em português, CI. Detalhes: `docs/weeks/etapa-01.md`.
- Decisões D-1 a D-11 e respostas Q-11, Q-12, Q-13, Q-19, Q-20 em `docs/requirements/perguntas-abertas.md`.
- Skill `frontend-design` instalada (D-11).

## Em andamento
- Planejamento da Etapa 2.

## Bloqueado
- ADR-0006 (momento da baixa de estoque) — aguarda Q-01; bloqueia a Etapa 5.

## Testes
- Vitest: 197 testes passando (unitários, propriedades, BDD de domínio, arquitetura e integração
  com MySQL 8.4 real). Cobertura do kernel: 96,8%.
- Playwright: 10 testes passando (celular, tablet, desktop + BDD).
- Revisão do `reviewer` da Etapa 1: aprovado com ressalvas, sem bloqueantes; 13 de 14 achados corrigidos.

## Bugs
Nenhum.

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).
- Revisar até 2027-03-31 a exceção GHSA-67mh-4wv8-2f99 (esbuild via drizzle-kit, só desenvolvimento).
- Job de limpeza da tabela de idempotência (retenção de 7 dias) — entra quando houver agendador.
- CSP completa com nonce — Etapa 2.
- Teste de idempotência com deadlock REAL (3 envios simultâneos, o 1º desfeito) — achado S-6 da revisão.
- Modelar venda por peso (preço por kg × quantidade) — Etapa 4, depende da Q-10.

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 2 — Identidade e acesso: login/logout, sessão (12 h sem uso / 7 dias), usuários, perfis e
permissões por loja, autorização de gerente por PIN, **troca rápida de usuário em aparelho
compartilhado** (Q-12), limite de tentativas de login, auditoria.
