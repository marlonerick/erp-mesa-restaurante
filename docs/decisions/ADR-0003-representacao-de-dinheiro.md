# ADR-0003 — Representação de dinheiro, percentuais e quantidades

- Status: **Proposto**
- Data: 2026-09-27
- Responsável: architect

## Contexto
O README permite centavos inteiros ou `DECIMAL(12,2)` e proíbe `FLOAT`/`DOUBLE`. Há um caso
não coberto: **custo unitário de insumo** por grama/ml é frequentemente fração de centavo
(ex.: queijo a R$ 45,90/kg = R$ 0,0459/g). Guardar em centavos causaria erro de até ~100% no custo teórico.

## Opções
1. `DECIMAL(12,2)` em tudo + biblioteca decimal no TS.
2. Centavos em `BIGINT` para valores transacionados + `DECIMAL(18,6)` para custo unitário.
3. Tudo em inteiros escalados (inclusive custo em micro-reais `BIGINT`).

## Decisão (proposta)
**Opção 2.**
- Valores transacionados (preço, desconto, taxa, total, pagamento, caixa, financeiro):
  `BIGINT` centavos; no código, value object `Money` sobre inteiro (`number` seguro até 2^53).
- Custo unitário de insumo: `DECIMAL(18,6)` em reais; no código, `UnitCost` sobre `bigint`
  de micro-reais (conversão string ↔ bigint sem passar por float).
- Percentuais: `INT` em pontos-base (`Percentage`), 10% = 1000.
- Quantidades: `DECIMAL(14,3)`; no código, `Quantity` sobre inteiro de milésimos + unidade base.

Regras de arredondamento:
- Arredondamento **half-up** (0,5 sobe) para centavos, somente no fim de cada cálculo.
- Taxa de serviço calculada sobre o subtotal após descontos de itens e da conta
  (**confirmar — Q-06**), arredondada uma vez.
- Divisão de conta por pessoas: partes iguais em centavos; o resto (1–n centavos) vai para as
  primeiras parcelas — soma sempre igual ao total.
- Custo teórico: `Σ quantidade(milésimos) × custo(micro-reais)` em `bigint`, arredondado a centavos só na exibição/relatório.

## Consequências
- (+) Nenhum float em dinheiro; custo de receita preciso.
- (−) Dois tipos monetários (`Money` e `UnitCost`) — conversão explícita e testada (fast-check).
