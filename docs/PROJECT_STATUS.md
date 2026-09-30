# Status do projeto

Última atualização: 2026-09-30

## Etapa atual
**Etapa 7 — KDS (tela da cozinha)** — plano aprovado em 2026-09-30 (Q-02 = opção A: tela +
botão "Imprimir"; Q-14: por item com "tudo pronto", alertas de 10/20 min configuráveis; decisões
E7-1 a E7-4) — implementada na `main`, em revisão pelo `reviewer`.

## Progresso do MVP

| Etapa | Nome | Status |
|---|---|---|
| 0 | Fase 0 — Análise e arquitetura | **Aprovada** em 2026-09-28 |
| 1 | Fundação | **Aprovada** em 2026-09-28 |
| 2 | Identidade e acesso | **Aprovada** em 2026-09-29 (com ajustes: olho na senha, limite de 64 caracteres) |
| 3 | Organização e contexto | **Aprovada** em 2026-09-29 |
| 4 | Catálogo | **Aprovada** em 2026-09-29 |
| 5 | Estoque e ficha técnica | **Aprovada** em 2026-09-30 |
| 6 | Salão, mesas e pedidos | **Aprovada** em 2026-09-30 |
| 7 | KDS | Entregue — em revisão |
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
- Etapa 5: insumos, saldo e custo médio por loja, movimentações imutáveis, mínimo,
  unidades de compra, ficha técnica de produtos e adicionais com custo e margem, baixa por venda
  pronta para a comanda (ADR-0006 A) (`docs/weeks/etapa-05.md`).
- Etapa 6: mesas por loja, mapa do salão que se atualiza sozinho, comanda no celular (itens com
  adicionais e observação, rodadas para a cozinha com baixa de estoque, cancelamento com motivo e PIN
  do gerente), pedir conta, transferir, juntar e separar mesas, balcão (`docs/weeks/etapa-06.md`).
- Etapa 7: tela da cozinha no tablet (fila do mais antigo ao mais novo, cronômetro pela hora do
  servidor, alertas de 10/20 min configuráveis por loja, iniciar/pronto por item, "tudo pronto",
  desfazer antes da entrega, item cancelado riscado, som, tela acesa, via de 80 mm pelo navegador)
  (`docs/weeks/etapa-07.md`).
- ADRs: 14 aceitos (0001–0014) — ADR-0006 aceito em 2026-09-29 (Q-01 = A).

## Em andamento
- Etapa 7: revisão do `reviewer` e CI.

## Bloqueado
- Nada bloqueado.

## Testes
- Vitest: 1602 testes (525 unitários + 1077 de integração com MySQL 8.4 real).
- Playwright: 129 testes (celular, tablet, desktop + BDD) e 4 pulados de propósito.

## Bugs
Nenhum aberto. Corrigidos na Etapa 7: deadlock ao lançar item em duas contas novas ao mesmo tempo
(vinha da Etapa 6); teste de navegador do salão que enviava a rodada antes de a
lista mostrar todos os itens (instável sob carga) — ver `docs/weeks/etapa-07.md`. Corrigidos na Etapa 6: leitura sem trava depois da trava da conta (cancelamento e
envio simultâneos), `count(*)` lido como número, teste de limpeza que apagava dados de outros
testes — ver `docs/weeks/etapa-06.md`. Corrigidos na Etapa 5: estorno em dobro com cancelamentos simultâneos (B-1 da
revisão), unidade "toString" derrubava o lançamento, campo de quantidade com ponto de milhar
gravaria 1 g no lugar de 1000 g — ver `docs/weeks/etapa-05.md`.

## Débitos técnicos
- Migrar para TypeScript 7 quando o `typescript-eslint` suportar (D-1).
- Avaliar Drizzle 1.0 quando sair a versão estável (D-2).
- Revisar até 2027-03-31 a exceção GHSA-67mh-4wv8-2f99 (esbuild via drizzle-kit, só desenvolvimento).
- Agendar `npm run maintenance:purge` diariamente no servidor (Etapa 10, junto com o deploy).
- Teste de idempotência com deadlock REAL (3 envios simultâneos, o 1º desfeito) — achado S-6 da revisão da Etapa 1.
- Venda por peso (preço por kg) — fora do piloto (Q-10); `Money.multiplyBy` já faz a conta.
- shadcn/ui: a janela (`src/ui/dialog.tsx`, Radix) entrou na Etapa 6 no padrão do shadcn, escrita à
  mão; os demais componentes entram conforme as telas precisarem (sem o gerador da CLI).
- Cancelar só parte da quantidade de um item (hoje cancela a linha) — avaliar no piloto.
- Juntar mesas trava as mesas em duas consultas (não numa ordem única): um deadlock raro é refeito
  automaticamente (ADR-0008); medir no piloto.
- Banco de E2E acumula mesas e contas de teste (números E…): `npm run db:e2e:reset` recria vazio
  (Etapa 7). Automatizar antes de cada execução local, se incomodar.
- Q-02 em aberto: modelo/conexão da impressora térmica e se o tablet é Android ou iPad (define se
  a impressão automática — quiosque ou ESC/POS — é possível no piloto).
- Envio de rodada: dois envios simultâneos em contas novas ainda geram deadlock no índice
  `uq_order_round_number` (trava de intervalo ao listar as rodadas com trava); a repetição
  automática resolve. Se aparecer no piloto, travar a conta como primeira leitura também no envio
  (como no lançamento — Etapa 7).
- Teste de navegador do cronômetro com o relógio do tablet adiantado/atrasado (S-5 da revisão da
  Etapa 7; a regra dos alertas já tem teste unitário).
- Tela cheia no tablet da cozinha (Fullscreen API ou "adicionar à tela inicial") — avaliar no piloto.
- KDS lê a fila completa a cada 3 s (cursor `since` adiado — kitchen.md §12): rever com mais de 100
  tickets na fila.
- `order_item.stock_consumed` fica verdadeiro mesmo para produto sem ficha técnica: a auditoria do
  cancelamento diz "voltou ao estoque" sem ter havido baixa (saldos corretos) — S-6 da revisão.
- Lançar item não é idempotente: toque duplo com rede ruim pode duplicar um item PENDENTE (o garçom
  remove) — S-7 da revisão; avaliar no piloto.
- Teste de navegador da mensagem de PIN errado no cancelamento, com um gerente só para ele (não travar
  o PIN do gerente compartilhado) — S-8 da reverificação.
- Horário de funcionamento da loja (abre/fecha) configurável — pedido na Q-05, sem uso ainda.
- `authenticate` consulta os perfis duas vezes por requisição (lojas acessíveis + permissões);
  unificar se aparecer no monitoramento de desempenho.
- Foto do produto (E4-3), depois do piloto.
- Etapa 9: `costOfGoodsSold`/`lossesValue`/`consumptionForItems` recebem loja/empresa do chamador —
  validar o escopo (ctx) quando os relatórios usarem (S-4 da revisão da Etapa 5).
- Seed de estoque usa fuso/virada fixos (S-6) e entrada simultânea a uma desativação do insumo
  pode passar (S-7, risco baixo) — revisão da Etapa 5.
- Trava do estorno: medir com dados reais qual índice o MySQL usa; se escolher o de loja/insumo,
  forçar `ix_stock_movement_origin` ou incluir `store_id` nele (S-8 da reverificação da Etapa 5).

## Riscos principais
R-01 (piloto sem fiscal), R-03 (pagamento duplicado), R-06 (isolamento entre lojas),
R-10 (internet instável), R-11 (impressão na cozinha). Tabela completa: docs/requirements/riscos.md.

## Próxima etapa
Etapa 8 — PDV e caixa. Antes dela: **Q-16** (fechamento cego) e **Q-17** (couvert, consumação).
