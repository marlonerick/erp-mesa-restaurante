# Etapa 6 — Salão, mesas e pedidos (`semana-6`)

Plano aprovado em 2026-09-30 com as respostas **Q-04** (comanda por mesa; balcão com nome livre),
**Q-08** (itens sem preparo não vão à cozinha; uma estação), **Q-15** (celulares da casa; tablet de
10" ou mais na cozinha), **Q-18** (garçom transfere e junta, com auditoria) e as decisões E6-1 a E6-7
(docs/requirements/perguntas-abertas.md).

## Objetivo
O garçom, no celular, abre a mesa (ou o pedido de balcão), lança itens com adicionais e observação,
envia a rodada para a cozinha — com a baixa de estoque da Etapa 5 —, cancela item enviado com motivo
e PIN do gerente, pede a conta, transfere, junta e separa mesas.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDDs `tables` (RN-TAB-01 a 08) e `orders` (RN-ORD-01 a 24); 5 arquivos BDD em português (mesas, comanda, envio para a cozinha, cancelamento, mesas e contas) |
| Banco | Migration 0009 (revisão): rótulo da conta com 160 caracteres. Migration 0008: `dining_table`, `customer_order`, `store_sequence` (número da conta por dia), `order_round`, `order_item`, `order_item_modifier`, `kitchen_ticket`; CHECKs de consistência; permissão nova `tables.configure` (E6-2) |
| Módulo Tables | Cadastro de mesas (número, área, lugares, ativa), máquina de estados, liberar mesa limpa, API com trava para a comanda |
| Módulo Orders | Abrir mesa/balcão, lançar (preço e adicionais congelados), remover pendente, enviar rodada (ticket da cozinha, itens sem preparo prontos, baixa de estoque, idempotente), entregar, cancelar com motivo/PIN (estorno ou perda), pedir conta, transferir, juntar (mescla contas), separar, cancelar conta vazia |
| Telas | **Salão** (mapa por área, cor + texto do estado, balcão, atualiza a cada 5 s); **Comanda** (adicionar item com busca, quantidade, adicionais, observação; enviar; rodadas; entregar; cancelar com PIN; ações da mesa); **Mesas** (cadastro) |
| Dependências (E6-5, E6-6) | `@radix-ui/react-dialog` (janela no padrão shadcn/ui em `src/ui/dialog.tsx`) e `@tanstack/react-query` (leitura automática); `npm audit` sem vulnerabilidades |
| Leitura automática | `GET /api/salao` e `GET /api/comandas/:id`, sem renovar a sessão (RN-AUTH-15) |
| Seed | 12 mesas no Centro (Salão e Varanda), 8 na Praia; mesa 2 do Centro com conta aberta |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| Modelo previa `quantity DECIMAL(14,3)` no item | Inteiro de 1 a 99 (E6-3; sem venda por peso — Q-10) | orders.md §9 |
| Modelo previa número único por `operational_date` definida no fechamento | `opened_date` (dia da abertura) + `store_sequence` com trava (E3-5) | RN-ORD-04 |
| Totais da conta (taxa, descontos, pago) no modelo inicial | Ficam para a migration da Etapa 8, quando forem usados; o subtotal é calculado dos itens | RN-ORD-15 |
| Ticket da cozinha: módulo Kitchen ou Orders? | Pertence ao Orders (evita ciclo Orders ↔ Kitchen); o KDS da Etapa 7 usa a API dele | maps/modules/dependencias.md |
| Evento `RoundSent` planejado | Chamada direta na mesma transação (mais simples, mesmo efeito) | dependencias.md |
| Mesa ligada à conta depois de fechada | `customer_order.label` guarda "10 + 11" (ou o nome do balcão) | modelo-de-dados.md |
| Cancelar parte da quantidade de um item | Fora do escopo: cancela a linha inteira (a baixa é por item) | orders.md §12 |
| Item sem preparo cancelado antes de entregar | Volta ao estoque (a lata ainda está fechada) | RN-ORD-13 |
| Cadastro de mesas: `tables.manage` é do garçom | Permissão nova `tables.configure` (ADMIN, GERENTE) | E6-2, matriz-rbac.md |
| Grupos de adicionais na janela | Obrigatórios primeiro ("Ponto da carne"), para o garçom não pular | views.ts |

## Problemas encontrados e corrigidos
1. **Dois cancelamentos simultâneos do mesmo item passavam os dois** e **dois envios simultâneos
   davam erro técnico** (chave duplicada da rodada) em vez de "os itens mudaram". Causa: depois de
   esperar a trava da conta, a transação relia os itens com leitura comum — em REPEATABLE READ ela
   devolve a "foto" do início da transação (o mesmo problema do achado B-1 da Etapa 5). Correção:
   tudo o que é lido depois da trava da conta é lido com trava (`FOR UPDATE`/`FOR SHARE`). Os testes
   de concorrência **falham sem a correção e passam com ela** (conferido desligando a trava).
2. **`count(*)` do MySQL chega como texto** (BIGINT): as duas contagens da comanda só funcionavam
   pela conversão automática do JavaScript — agora convertem explicitamente.
3. **Teste antigo apagava dados de outros testes**: o teste da limpeza periódica (Etapa 2) adiantava o
   relógio 91 dias e apagava os contadores de senha/PIN errados do banco inteiro; com mais arquivos de
   teste rodando juntos, isso passou a acontecer no meio dos cenários de bloqueio (falha
   intermitente). Correção: o teste da limpeza trabalha 400 dias no passado e só apaga os dados dele.
4. **Seed**: a virada do dia vem do banco como "05:00:00" e o cálculo espera "05:00".
5. **Telas (vistos nos testes e prints)**: dois botões "Fechar" na mesma janela (o X virou "Fechar
   janela"); a tela Início ainda dizia que as mesas "chegam nas próximas etapas".

## Revisão do `reviewer` (2026-09-30)

1ª revisão: **reprovada** — 1 bloqueante, 3 importantes, 7 sugestões (lint, typecheck, 479 unitários,
868 de integração, `drizzle-kit check` e `npm audit` passaram). Correções:

| # | Achado | Correção |
|---|---|---|
| B-1 | **Pedir a conta de mesas juntadas dava erro técnico**: a auditoria juntava os ids das mesas num campo de 64 caracteres (reproduzido pelo revisor no MySQL) | Um registro de auditoria por mesa; 3 cenários BDD novos com mesas juntadas (pedir conta, pedir mais depois da conta, juntar conta que já tinha 2 mesas) — **falham com o código antigo** (`Data too long for column 'entity_id'`) e passam com a correção |
| I-1 | Juntar muitas mesas estourava o rótulo da conta (60 caracteres) | No máximo 12 mesas por conta (`ORDER_TABLE_LIMIT`) e rótulo de 160 caracteres (migration 0009); teste com 12 mesas "Varanda N" |
| I-2 | A janela de cancelamento dizia "perda" para a bebida pronta que volta ao estoque | A tela usa a mesma regra do domínio (`cancelEffect` na comanda) |
| I-3 | Faltava o teste de isolamento do cadastro de mesas citado no SDD | `tests/integration/modules/tables/tables-rules.test.ts` (ler, alterar e listar mesa de outra loja) |
| S-1 | Juntar podia passar de 300 itens | Confere o limite antes de mesclar |
| S-2 | Conta de outra loja aparecia como "Sem conexão" para sempre | 403/404 param a leitura automática e explicam |
| S-3 | Rota da comanda pedia menos permissão que a página | Pede `tables.read` também |
| S-4 | Adicional opcional de uma escolha não desmarcava | Vira caixa de marcar exclusiva |
| S-5 | Renomear mesa ocupada deixava o rótulo da conta velho | Só troca o número de mesa livre |
| S-6, S-7 | `stock_consumed` marcado mesmo sem ficha; lançar item não é idempotente | Débitos no PROJECT_STATUS |

**Instabilidade nos testes de navegador (achada nesta rodada):** o teste de cancelamento digitava um
PIN errado de propósito para o `gerente` — o mesmo usuário em todos os aparelhos em paralelo e em
todas as execuções. Os erros somavam para **travar o PIN** do gerente, e o PIN correto passava a ser
recusado (a mensagem é igual de propósito — RN-AUTHZ-10); PIN travado ainda roda o hash falso, o
que deixava o servidor mais lento para os outros testes. O passo foi retirado (PIN errado continua
testado na integração); duas execuções completas seguidas passaram (114/114).

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0008 e a 0009), `npm run db:seed` (cria as mesas), `npm run dev`.
2. Entre como `joao` / `Garcom@2026` (de preferência no celular) → **Salão**.
3. Toque na mesa **1** → Abrir mesa → **Adicionar item** → X-Burger, "Ao ponto", Bacon, observação →
   Lançar → **Enviar para a cozinha**. Veja a rodada e, em **Estoque**, a carne baixando (como gerente).
4. Lance um **Refrigerante lata**: ao enviar, ele já fica "Pronto" → **Entregar**.
5. **Cancelar** o X-Burger: peça o PIN do gerente (`gerente` / PIN `739104`).
6. **Pedir a conta**, **Transferir**, **Juntar mesa**; volte ao Salão e veja as cores e os textos.
7. Como `gerente` / `Gerente@2026`: **Administração → Mesas** para cadastrar mesas.

## Testes (2026-09-30)

| Tipo | Resultado |
|---|---|
| Unitários (regras de mesas e comanda, adicionais, subtotal com fast-check, efeito no estoque) | ✅ 479 |
| Integração com MySQL 8.4 real (BDD + concorrência + isolamento + idempotência + CHECKs) | ✅ 904 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 114 (4 pulados de propósito) |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (índices antes das FKs; aplicada no banco de desenvolvimento)
- [x] Testes unitários, integração (MySQL real), BDD, concorrência, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub
- [ ] Revisão do `reviewer` (1ª reprovada; achados corrigidos; aguardando reverificação)
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
