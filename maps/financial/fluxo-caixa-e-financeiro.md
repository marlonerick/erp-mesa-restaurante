# Caixa, pagamentos e financeiro

## Pagamento de uma conta

```mermaid
flowchart TD
  PC[Pré-conta<br/>subtotal − descontos + taxa de serviço] --> PAY[Registrar pagamento<br/>método, valor, idempotencyKey]
  PAY --> CX{Sessão de caixa aberta<br/>no terminal?}
  CX -- não --> E1[422 CASH_SESSION_REQUIRED]
  CX -- sim --> ID{Chave já usada?}
  ID -- sim, mesmo payload --> ORIG[Devolve pagamento original]
  ID -- sim, payload diferente --> E2[409 IDEMPOTENCY_KEY_REUSED]
  ID -- não --> VAL{Valor ≤ saldo da conta?}
  VAL -- não e não é dinheiro --> E3[422 PAYMENT_EXCEEDS_BALANCE]
  VAL -- ok --> REG[payment CONFIRMADO<br/>troco só em DINHEIRO<br/>cash_movement VENDA<br/>audit PAYMENT_CREATED]
  REG --> TOT{Saldo = 0?}
  TOT -- não --> PAY
  TOT -- sim --> FEC[Conta FECHADO<br/>operational_date da sessão<br/>mesa LIMPEZA<br/>audit ORDER_CLOSED]
```

## Sessão de caixa e financeiro

```mermaid
flowchart LR
  AB[Abertura<br/>valor inicial] --> MOV[Movimentos<br/>VENDA · SANGRIA · SUPRIMENTO · AJUSTE · ESTORNO]
  MOV --> FC[Fechamento cego<br/>operador informa valores]
  FC --> DIV[Esperado × informado × diferença<br/>por método]
  FC --> FIN[finance_entry RECEITA<br/>uma por método da sessão]
  DESP[Despesas manuais<br/>finance.manage] --> FLX[Fluxo de caixa simplificado]
  FIN --> FLX
```

Esperado em dinheiro = abertura + VENDA(dinheiro, líquido de troco) + SUPRIMENTO − SANGRIA ± AJUSTE − ESTORNO(dinheiro).
