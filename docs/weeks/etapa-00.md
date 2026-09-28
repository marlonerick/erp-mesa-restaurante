# Etapa 0 — Fase 0: Análise e arquitetura

## Objetivo
Entender o produto, decidir a arquitetura e registrar decisões antes de qualquer código.

## Escopo
Todos os entregáveis de B.13 do README: documentação em `/docs`, diagramas em `/maps`,
subagentes propostos em `.claude/agents/`.

## Fora do escopo
Qualquer código de aplicação, `package.json`, configuração de ferramentas, Docker, CI, `git init`.

## Dependências
Nenhuma.

## Entregáveis

| # (B.13) | Entregável | Arquivo |
|---|---|---|
| 1 | Entendimento, riscos, pontos críticos | docs/requirements/visao-e-escopo.md, docs/requirements/riscos.md |
| 2 | Escopo do MVP, fora do escopo, P0–P3 | docs/requirements/visao-e-escopo.md |
| 3 | Golden path em diagrama | maps/flows/golden-path.md |
| 4 | Arquitetura | docs/architecture/visao-geral.md, maps/architecture/sistema.md |
| 5 | Estrutura de diretórios | docs/architecture/visao-geral.md §11 |
| 6 | Modelo de dados + ERD | docs/database/modelo-de-dados.md, maps/database/erd.md |
| 7 | Dependências entre módulos | maps/modules/dependencias.md |
| 8 | Subagentes | .claude/agents/*.md |
| 9 | Ferramentas e bibliotecas | docs/architecture/ferramentas.md |
| 10 | Roadmap das etapas 1–10 | maps/ROADMAP.md, maps/roadmap/etapas.md |
| 11 | TDD, BDD, SDD | docs/testing/estrategia-testes.md, docs/modules/_TEMPLATE-SDD.md |
| 12 | Segurança e performance | docs/security/estrategia-seguranca.md, docs/architecture/performance.md |
| 13 | Tabela de riscos | docs/requirements/riscos.md |
| 14 | ADRs iniciais | docs/decisions/ADR-0001 … ADR-0013 |
| 15 | Perguntas ao usuário | docs/requirements/perguntas-abertas.md |

Complementares: docs/api/convencoes.md, docs/integrations/integracoes-futuras.md,
docs/deployment/ambientes.md, maps de estados, permissões, KDS, estoque, financeiro, navegação e integrações.

## Critérios de aceite
- Todos os 15 itens de B.13 entregues e rastreáveis na tabela acima.
- Nenhum código de aplicação criado.
- Todos os 17 itens da Parte A.3 endereçados (docs/requirements/riscos.md).
- ADRs com status `Proposto` e perguntas bloqueantes listadas.

## Riscos
Decisões tomadas sem as respostas de Q-01…Q-20 — mitigado por propostas padrão explícitas.

## Definition of Done
- [x] Entregáveis criados
- [x] PROJECT_STATUS.md atualizado
- [x] Revisão e `APROVADO` do usuário (2026-09-28)
- [x] ADRs movidos para `Aceito` conforme as respostas (ADR-0006 segue aguardando Q-01)
