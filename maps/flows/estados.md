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
  OCUPADA --> LIVRE: conta CANCELADO (sem itens / mesclada)
  LIMPEZA --> LIVRE: liberar mesa
```

Transferir: conta aberta vai da mesa origem para a destino (`LIVRE`); origem → `LIVRE`.
Juntar: mesa origem passa a apontar para a conta da mesa destino; itens movidos.

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
  EM_PREPARO --> PRONTO: cozinha marca pronto
  PRONTO --> ENTREGUE: garçom entrega
  ENVIADO --> PRONTO: item sem preparo (Q-08)
  ENVIADO --> CANCELADO: orders.cancel + motivo (estorno de estoque)
  EM_PREPARO --> CANCELADO: orders.cancel + motivo (perda)
  PRONTO --> CANCELADO: orders.cancel + motivo (perda)
  ENTREGUE --> CANCELADO: orders.cancel + motivo + autorização elevada (perda)
```

## Ticket de cozinha (`kitchen_ticket.status`)

Derivado dos itens: `NOVO` (todos `ENVIADO`) → `EM_PREPARO` (algum em preparo) → `PRONTO`
(todos prontos/entregues/cancelados) ; `CANCELADO` (todos cancelados).

```mermaid
stateDiagram-v2
  [*] --> NOVO
  NOVO --> EM_PREPARO
  EM_PREPARO --> PRONTO
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
