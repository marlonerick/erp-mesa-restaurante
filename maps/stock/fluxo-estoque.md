# Fluxo de estoque

```mermaid
flowchart TD
  subgraph Manual[Movimentos manuais — inventory.manage]
    E[ENTRADA<br/>qtd na unidade de compra → conversão para base<br/>recalcula custo médio]
    S[SAIDA]
    A[AJUSTE<br/>contagem física]
    P[PERDA<br/>motivo obrigatório]
  end

  subgraph Venda[Movimentos de venda — ADR-0006]
    RS[Rodada enviada] --> F{Produto tem ficha técnica?}
    F -- não --> N[Nada a baixar]
    F -- sim --> POL{Saldo suficiente?}
    POL -- sim --> CV[CONSUMO_VENDA por insumo]
    POL -- não, PERMITIR_COM_ALERTA --> CVA[CONSUMO_VENDA + alerta]
    POL -- não, BLOQUEAR --> ERR[422 INSUFFICIENT_STOCK<br/>rodada não enviada]
    CAN[Item cancelado] --> Q{Já em preparo?}
    Q -- não --> EST[ESTORNO_VENDA]
    Q -- sim --> PER[PERDA vinculada ao item]
  end

  E & S & A & P & CV & CVA & EST & PER --> TX[[Mesma transação:<br/>stock_movement + ingredient_stock<br/>FOR UPDATE, version]]
  TX --> MIN{saldo ≤ mínimo?}
  MIN -- sim --> ALR[Alerta de estoque mínimo<br/>insumo, saldo, mínimo]
```

## Custo

- Custo médio ponderado na ENTRADA: `novo_custo = (saldo × custo_atual + qtd × custo_entrada) / (saldo + qtd)`
  (saldo negativo tratado como zero no cálculo — regra a validar no SDD).
- Custo teórico do produto = Σ (quantidade da ficha × custo médio do insumo).
- CMV do período = Σ custo dos movimentos `CONSUMO_VENDA` − `ESTORNO_VENDA` (e perdas reportadas à parte).
