# Status do projeto

Última atualização: 2026-09-29

## Etapa atual
**Etapa 5 — Estoque e ficha técnica** — implementada na `main`; em revisão (CI + `reviewer`)
antes de pedir a aprovação do usuário.

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | **Aprovada** em 2026-09-28 |
| 2 | Identidade e acesso | **Aprovada** em 2026-09-29 (com ajustes: olho na senha, limite de 64 caracteres) |
| 3 | Organização e contexto | **Aprovada** em 2026-09-29 |
| 4 | Catálogo | **Aprovada** em 2026-09-29 |
| 5 | Estoque e ficha técnica | Implementada — em revisão |
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
- Etapa 4: categorias, produtos, preço por loja, adicionais com preço único na empresa,
  disponibilidade do dia por loja, cardápio vendável para a comanda (`docs/weeks/etapa-04.md`).
- Etapa 5 (em revisão): insumos, saldo e custo médio por loja, movimentações imutáveis, mínimo,
  unidades de compra, ficha técnica de produtos e adicionais com custo e margem, baixa por venda
  pronta para a comanda (ADR-0006 A) (`docs/weeks/etapa-05.md`).
- ADRs: 14 aceitos (0001–0014) — ADR-0006 aceito em 2026-09-29 (Q-01 = A).

## Em andamento
- Revisão da Etapa 5 (CI e `reviewer`).

## Bloqueado
- Nada bloqueado.

## Testes
- Vitest: 971 testes (434 unitários + 537 de integração com MySQL 8.4 real).
- Playwright: 96 testes (celular, tablet, desktop + BDD) e 4 pulados de propósito.

## Bugs
Nenhum aberto. Corrigidos na Etapa 5: estorno em dobro com cancelamentos simultâneos (B-1 da
revisão), unidade "toString" derrubava o lançamento, campo de quantidade com ponto de milhar
gravaria 1 g no lugar de 1000 g — ver `docs/weeks/etapa-05.md`.

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).
- Revisar até 2027-03-31 a exceção GHSA-67mh-4wv8-2f99 (esbuild via drizzle-kit, só desenvolvimento).
- Agendar `npm run maintenance:purge` diariamente no servidor (Etapa 10, junto com o deploy).
- Teste de idempotência com deadlock REAL (3 envios simultâneos, o 1º desfeito) — achado S-6 da revisão da Etapa 1.
- Venda por peso (preço por kg) — fora do piloto (Q-10); `Money.multiplyBy` já faz a conta.
- Instalar shadcn/ui e Radix quando uma tela precisar de janela (provável Etapa 6: escolher
  adicionais na comanda) — E4-5 adiado, ver etapa-04.md.
- Horário de funcionamento da loja (abre/fecha) configurável — pedido na Q-05, sem uso ainda.
- `authenticate` consulta os perfis duas vezes por requisição (lojas acessíveis + permissões);
  unificar se aparecer no monitoramento de desempenho.
- Foto do produto (E4-3), depois do piloto.
- Etapa 9: `costOfGoodsSold`/`lossesValue`/`consumptionForItems` recebem loja/empresa do chamador —
  validar o escopo (ctx) quando os relatórios usarem (S-4 da revisão da Etapa 5).
- Seed de estoque usa fuso/virada fixos (S-6) e entrada simultânea a uma desativação do insumo
  pode passar (S-7, risco baixo) — revisão da Etapa 5.

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 6 — Salão, mesas e pedidos (mapa de mesas, comanda no celular, rodadas enviadas à cozinha
com a baixa de estoque, cancelamento com aprovação). Antes dela: **Q-04** (comanda por mesa ou por
cliente; balcão), **Q-08** (bebidas no KDS; bar separado), **Q-15** (aparelhos do salão e do KDS)
e **Q-18** (garçom pode transferir e juntar mesas).
