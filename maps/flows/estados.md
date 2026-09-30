# Máquinas de estado

## Mesa (`dining_table.status`)

```mermaid
stateDiagram-v2
  [*] --> LIVRE
  LIVRE --> OCUPADA: abrir mesa (cria conta)
  OCUPADA --> AGUARDANDO_CONTA: solicitar conta
  AGUARDANDO_CONTA --> OCUPADA: cliente pediu mais (auditado)
  AGUARDANDO_CONTA --> EM_PAGAMENTO: caixa inicia pagamento
  EM_PAGAMENTO --> AGUARDANDO_CONTA: pagamento interrompido
  EM_PAGAMENTO --> LIMPEZA: conta FECHADO
  OCUPADA --> LIVRE: conta CANCELADO (nada enviado) / transferir (origem) / separar
  AGUARDANDO_CONTA --> LIVRE: transferir (origem) / separar
  LIMPEZA --> LIVRE: liberar mesa
```

Implementado na Etapa 6 (docs/modules/tables.md, orders.md); `EM_PAGAMENTO` e `LIMPEZA` chegam
com o PDV (Etapa 8). Transferir: a conta vai para a mesa destino (`LIVRE`), que assume o estado da
origem; origem → `LIVRE`. Juntar: a mesa passa a apontar para a conta de destino; se tinha conta,
itens, rodadas (renumeradas) e tickets são movidos e a conta dela fica `CANCELADO` (`MESCLADA`);
todas as mesas da conta → `OCUPADA`. Separar: a mesa sai de uma conta com outras mesas → `LIVRE`.

## Conta (`customer_order.status`)

```mermaid
stateDiagram-v2
  [*] --> ABERTO
  ABERTO --> FECHADO: pagamentos cobrem o total
  ABERTO --> CANCELADO: sem itens válidos, com motivo (ou MESCLADA)
  FECHADO --> ABERTO: reabrir (autorização elevada, auditado)
```

Reabrir conta: previsto no README como ação sensível; exige cancelar pagamentos antes ou
manter saldo — detalhar no SDD de Payments (Etapa 8).

## Item (`order_item.status`)

```mermaid
stateDiagram-v2
  [*] --> PENDENTE: lançado
  PENDENTE --> [*]: removido (orders.update, sem auditoria de cancelamento)
  PENDENTE --> ENVIADO: rodada enviada
  ENVIADO --> EM_PREPARO: cozinha inicia
  ENVIADO --> PRONTO: cozinha marca pronto (sem iniciar) / tudo pronto
  EM_PREPARO --> PRONTO: cozinha marca pronto
  PRONTO --> EM_PREPARO: cozinha desfaz, antes de entregar (E7-2, auditado)
  PRONTO --> ENTREGUE: garçom entrega
  PENDENTE --> PRONTO: rodada enviada, item sem preparo (Q-08)
  ENVIADO --> CANCELADO: orders.cancel ou PIN do gerente + motivo (estorno)
  EM_PREPARO --> CANCELADO: orders.cancel ou PIN do gerente + motivo (perda)
  PRONTO --> CANCELADO: orders.cancel ou PIN do gerente + motivo (perda; estorno se sem preparo)
  ENTREGUE --> CANCELADO: orders.cancel ou PIN do gerente + motivo (perda)
```

## Ticket de cozinha (`kitchen_ticket.status`)

Calculado dos itens não cancelados (RN-KDS-06, Etapa 7): `NOVO` (todos `ENVIADO`),
`EM_PREPARO` (algum começou ou ficou pronto), `PRONTO` (todos prontos/entregues), `CANCELADO`
(todos cancelados). `PRONTO` e `CANCELADO` gravam `finished_at` (saída da fila).

```mermaid
stateDiagram-v2
  [*] --> NOVO
  NOVO --> EM_PREPARO
  NOVO --> PRONTO: tudo pronto
  EM_PREPARO --> PRONTO
  PRONTO --> EM_PREPARO: desfazer
  NOVO --> CANCELADO
  EM_PREPARO --> CANCELADO
```

## Sessão de caixa (`cash_session.status`)

```mermaid
stateDiagram-v2
  [*] --> ABERTA: cashier.open (1 por terminal)
  ABERTA --> ABERTA: VENDA / SANGRIA / SUPRIMENTO / AJUSTE
  ABERTA --> FECHADA: cashier.close (valores informados às cegas)
  FECHADA --> [*]
```

## Pagamento (`payment.status`)

```mermaid
stateDiagram-v2
  [*] --> CONFIRMADO: payments.create (idempotente)
  CONFIRMADO --> CANCELADO: payments.cancel + autorização elevada (ESTORNO no caixa)
```
