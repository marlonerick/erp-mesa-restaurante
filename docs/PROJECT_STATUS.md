# Status do projeto

Última atualização: 2026-09-29

## Etapa atual
**Etapa 3 — Organização e contexto** — entregue na `main`, **aguardando aprovação do usuário**.

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | **Aprovada** em 2026-09-28 |
| 2 | Identidade e acesso | **Aprovada** em 2026-09-29 (com ajustes: olho na senha, limite de 64 caracteres) |
| 3 | Organização e contexto | Entregue — aguardando `APROVADO` |
| 4 | Catálogo | Não iniciada |
| 5 | Estoque e ficha técnica | Não iniciada |
| 6 | Salão, mesas e pedidos | Não iniciada |
| 7 | KDS | Não iniciada |
| 8 | PDV e caixa | Não iniciada |
| 9 | Financeiro básico, dashboard e relatórios | Não iniciada |
| 10 | Estabilização e piloto (MVP Gate) | Não iniciada |

## Concluído
- Etapa 0: documentação em `/docs`, diagramas em `/maps`, 6 subagentes, ADRs.
- Etapa 1: fundação técnica (detalhes em `docs/weeks/etapa-01.md`).
- Etapa 2: login, sessões, troca rápida por PIN, usuários, perfis por loja, autorização do gerente,
  auditoria imutável, CSP com nonce, telas com identidade de azulejo (`docs/weeks/etapa-02.md`).
- Etapa 3: empresa, lojas com configurações (virada do dia, taxa de serviço, estoque negativo,
  caixas abertos), terminais com vínculo do aparelho, estação de cozinha padrão, troca de loja em
  1 clique, dia operacional, menu lateral (`docs/weeks/etapa-03.md`).
- ADRs: 13 aceitos (0001–0005, 0007–0014); ADR-0006 aguardando Q-01.

## Em andamento
- Revisão da Etapa 3 pelo usuário.

## Bloqueado
- ADR-0006 (momento da baixa de estoque) — aguarda Q-01; bloqueia a Etapa 5.

## Testes
- Vitest: 549 testes (300 unitários + 249 de integração com MySQL 8.4 real).
- Playwright: 60 testes (celular, tablet, desktop + BDD) e 4 pulados de propósito.

## Bugs
Nenhum aberto. Corrigidos na Etapa 3: organização podia ficar sem loja ativa (concorrência),
página mais larga que o celular no cadastro de loja, vínculo de aparelho entre organizações
(achado B-1 da revisão) — ver `docs/weeks/etapa-03.md`.

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).
- Revisar até 2027-03-31 a exceção GHSA-67mh-4wv8-2f99 (esbuild via drizzle-kit, só desenvolvimento).
- Agendar `npm run maintenance:purge` diariamente no servidor (Etapa 10, junto com o deploy).
- Teste de idempotência com deadlock REAL (3 envios simultâneos, o 1º desfeito) — achado S-6 da revisão da Etapa 1.
- Modelar venda por peso (preço por kg × quantidade) — Etapa 4, depende da Q-10.
- Instalar a CLI do shadcn/ui e Radix quando houver janelas e seletores (Etapa 4).
- Horário de funcionamento da loja (abre/fecha) configurável — pedido na Q-05, sem uso ainda.
- `authenticate` consulta os perfis duas vezes por requisição (lojas acessíveis + permissões);
  unificar se aparecer no monitoramento de desempenho.

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 4 — Catálogo: categorias, produtos, preço por loja, adicionais básicos, ativo/inativo,
disponibilidade. Antes dela: responder **Q-09** (adicionais consomem estoque? preço por loja?) e
**Q-10** (venda por peso).
