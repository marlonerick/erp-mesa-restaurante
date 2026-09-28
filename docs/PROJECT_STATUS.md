# Status do projeto

Última atualização: 2026-09-28

## Etapa atual
**Etapa 2 — Identidade e acesso** — entregue na `main`, **aguardando aprovação do usuário**.

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | **Aprovada** em 2026-09-28 |
| 2 | Identidade e acesso | Entregue — aguardando `APROVADO` |
| 3 | Organização e contexto | Não iniciada |
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
  auditoria imutável, CSP com nonce, telas com identidade de azulejo, comandos de instalação,
  seed e limpeza LGPD (detalhes em `docs/weeks/etapa-02.md`).
- ADRs: 13 aceitos (0001–0005, 0007–0014); ADR-0006 aguardando Q-01.

## Em andamento
- Revisão da Etapa 2 pelo usuário.

## Bloqueado
- ADR-0006 (momento da baixa de estoque) — aguarda Q-01; bloqueia a Etapa 5.

## Testes
- Vitest: 400 testes (244 unitários + 156 de integração com MySQL 8.4 real). Cobertura do kernel: 96,8%.
- Playwright: 37 testes (celular, tablet, desktop + BDD).

## Bugs
Nenhum aberto. Corrigido na Etapa 2: deadlock em logins simultâneos (ver etapa-02.md).

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).
- Revisar até 2027-03-31 a exceção GHSA-67mh-4wv8-2f99 (esbuild via drizzle-kit, só desenvolvimento).
- Agendar `npm run maintenance:purge` diariamente no servidor (Etapa 10, junto com o deploy).
- Teste de idempotência com deadlock REAL (3 envios simultâneos, o 1º desfeito) — achado S-6 da revisão da Etapa 1.
- Modelar venda por peso (preço por kg × quantidade) — Etapa 4, depende da Q-10.
- Instalar a CLI do shadcn/ui e Radix quando houver janelas e seletores (Etapa 4).
- FK de `idempotency_record.store_id` para `store` (D-4) — Etapa 3.

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 3 — Organização e contexto: cadastro de empresa/lojas/terminais, configurações da loja
(fuso, horário de corte, taxa de serviço, política de estoque negativo), troca de loja em 1 clique.
Antes dela: responder Q-05 (horário de funcionamento e corte do dia).
