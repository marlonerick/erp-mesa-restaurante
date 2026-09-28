# Status do projeto

Última atualização: 2026-09-28

## Etapa atual
**Etapa 1 — Fundação** — em andamento (ramo `etapa-01-fundacao`).

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | Em andamento |
| 2 | Identidade e acesso | Não iniciada |
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
- Decisões D-1 a D-7 registradas em `docs/requirements/perguntas-abertas.md`.

## Em andamento
- Etapa 1 — Fundação (plano aprovado em 2026-09-28).

## Bloqueado
- ADR-0006 (momento da baixa de estoque) — aguarda Q-01; bloqueia a Etapa 5.

## Testes
Nenhum ainda.

## Bugs
Nenhum.

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 2 — Identidade e acesso, após `APROVADO` da Etapa 1.
