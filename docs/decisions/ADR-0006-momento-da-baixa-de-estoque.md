# ADR-0006 — Momento da baixa de estoque

- Status: **Proposto — AGUARDANDO DECISÃO DO USUÁRIO** (pergunta Q-01)
- Data: 2026-09-27
- Responsável: architect + domain-spec

## Contexto
"Baixar ao vender" é ambíguo. O momento muda cancelamento, perda, CMV e saldo visível durante o serviço.

## Opções

### A) Ao enviar para produção (`ENVIADO`) — recomendação do README
- Cancelamento antes do preparo (`ENVIADO`, ainda não `EM_PREPARO`) → `ESTORNO_VENDA` (volta ao saldo).
- Cancelamento depois do preparo (`EM_PREPARO`/`PRONTO`/`ENTREGUE`) → mantém o consumo e registra `PERDA` vinculada ao item.
- Prós: saldo reflete a realidade da cozinha durante o serviço; perdas por cancelamento ficam visíveis;
  alerta de estoque mínimo acontece a tempo; estoque insuficiente é detectado no envio da rodada (momento certo para avisar o garçom).
- Contras: mais movimentações; transação do envio de rodada fica maior; itens sem ficha técnica precisam de regra (não baixam nada).

### B) No fechamento da conta
- Prós: implementação mais simples; uma baixa por conta; cancelamentos antes do fechamento não geram movimento.
- Contras: saldo fica defasado durante todo o serviço (conta aberta às 20h só baixa às 23h); perdas por
  cancelamento de item preparado **desaparecem** (viram "sumiço" no inventário); `BLOQUEAR` estoque negativo
  bloquearia o **pagamento**, não o pedido — péssimo momento para bloquear.

### C) Ao lançar o item (`PENDENTE`)
- Descartada: itens pendentes são rascunho do garçom e podem ser removidos livremente.

## Recomendação
**Opção A.** Ela torna a política `BLOQUEAR` (ADR-0007) aplicável no envio da rodada e produz CMV e perdas corretos.

## Consequências (se A for aceita)
- Consumo roda na mesma transação de `orders.sendRound` (Etapa 6 depende da Etapa 5).
- `order_item.stock_consumed` marca itens baixados; estorno/perda usam `origin_type = ORDER_ITEM`.
- Adicionais com ficha técnica: dependem da pergunta Q-09.
- Cenários BDD de Recipes/Inventory escritos conforme a decisão.
