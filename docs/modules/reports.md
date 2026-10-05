# Reports (painel e relatórios) — Especificação (SDD)

> Status: Aprovado — Etapa: 9 — Responsável: domain-spec
> Decisões: README B.7.7, E9-1, E9-4 a E9-7 (docs/requirements/perguntas-abertas.md), ADR-0009,
> ADR-0013. Exceção documentada (perguntas-abertas, ponto 6): Reports **lê** tabelas de vários
> módulos por consultas somente leitura — sem escrita, sem regra de negócio.

## 1. Objetivo
Mostrar como está o dia (painel na tela inicial) e responder perguntas do período: quanto vendeu, o
quê, como pagaram, como fecharam os caixas, como está o estoque e a operação, e quem fez o quê.

## 2. Atores
Painel: ADMIN, GERENTE, CAIXA (`dashboard.read` — E9-4). Relatórios: ADMIN, GERENTE (`reports.read`);
auditoria: `audit.read`.

## 3. Regras de negócio
- **RN-REP-01** — Tudo da **loja ativa**, no **dia operacional** (ADR-0013). Períodos de até 366 dias,
  `de` ≤ `até`; sem período, "hoje" (dia operacional atual).
- **RN-REP-02** — **Venda** = conta FECHADA, no dia operacional do fechamento (`closed_date` — E9-1).
  Valores congelados no fechamento (Etapa 8): itens, descontos, taxa, total. **Ticket médio** = total
  ÷ número de contas fechadas (arredondamento half-up; zero contas = R$ 0,00).
- **RN-REP-03** — **Painel** (dia operacional atual; atualiza a cada 30 s sem renovar a sessão):
  vendas do dia, contas fechadas, ticket médio, contas abertas, mesas ocupadas, itens na cozinha
  (enviados + em preparo), itens atrasados (tickets da fila há mais que o vermelho da loja), caixas
  abertos (terminal e quem abriu — **sem esperado**, RN-CASH-06), 5 mais vendidos (quantidade) e
  insumos com saldo ≤ mínimo (com mínimo > 0). O CAIXA vê tudo isso (E9-4).
- **RN-REP-04** — **Vendas**: por dia (contas, itens, descontos, taxa, total, ticket médio); por produto
  (quantidade, valor bruto, descontos nos itens e — E9-7 — custo e margem: custo = consumo da ficha no
  momento da venda, `stock_movement` de venda menos estorno do item); por categoria (categoria atual
  do produto); por forma de pagamento (pagamentos ativos, pelo dia operacional do caixa que recebeu).
- **RN-REP-05** — **Caixa**: caixas abertos no período com terminal, quem abriu/fechou, fundo,
  sangrias, suprimentos e — só dos fechados — esperado, informado, diferença por forma e sangrias
  acima do esperado (Etapa 8, E8-6).
- **RN-REP-06** — **Estoque**: saldo atual e mínimo de cada insumo (abaixo do mínimo destacado);
  movimentações do período por tipo (quantidade de lançamentos e valor); CMV e perdas do período
  (cálculos da Etapa 5 — RN-INV).
- **RN-REP-07** — **Operação**: contas abertas no período por tipo (mesa/balcão), fechadas, canceladas
  (vazias ou juntadas), pessoas por mesa (média), itens cancelados (quantidade, valor e motivos mais
  comuns), descontos concedidos (valor) e taxas retiradas (quantidade).
- **RN-REP-08** — **Auditoria** (`audit.read`): eventos da loja ativa no período, filtro por evento e
  por pessoa, mais recentes primeiro, 50 por página.
- **RN-REP-09** — Listas longas (produtos, movimentações, auditoria) com **paginação no servidor**;
  **CSV** de cada relatório (E9-6) com o mesmo filtro, até 10.000 linhas, separador `;` e vírgula
  decimal (abre direto no Excel brasileiro).

## 4. Exceções
| Situação | Código | HTTP | Mensagem |
|---|---|---|---|
| Período inválido | `INVALID_PERIOD` | 400 | Escolha um período de até 366 dias. |
| Sem permissão | `FORBIDDEN` | 403 | Você não tem permissão para esta ação. |

## 5. Contratos
| Ação | Entrada | Saída |
|---|---|---|
| `GET /api/painel?loja=` (`reports.dashboard`) | — | painel do dia |
| `reports.sales` | `{ from, to }` | por dia, por categoria, por forma, totais |
| `reports.salesByProduct` | `{ from, to, page }` | linhas + total de linhas |
| `reports.cash` | `{ from, to }` | caixas com movimentos e conferência |
| `reports.stock` | `{ from, to }` | saldos, movimentações por tipo, CMV, perdas |
| `reports.operations` | `{ from, to }` | indicadores da operação |
| `reports.audit` | `{ from, to, event?, userId?, page }` | eventos + total |
| `GET /relatorios/csv/:tipo?de=&ate=` | — | arquivo CSV |

## 6. Modelo de dados (migration 0012)
`customer_order.closed_date` (dia operacional do fechamento; preenchido nas contas já fechadas) e
índices para os relatórios: (store_id, status, closed_date) em `customer_order`; (store_id,
operational_date, status) em `cash_session`.

## 7. Critérios de aceite
- **CA-REP-01** — Vendas do dia, ticket médio e mais vendidos conferem com as contas fechadas → `tests/features/reports/painel.feature`
- **CA-REP-02** — Venda conta no dia do fechamento (virada às 05:00) → `relatorios.feature`
- **CA-REP-03** — Vendas por produto com custo e margem; por forma de pagamento → `relatorios.feature`
- **CA-REP-04** — Caixa vê o painel, não os relatórios; outra loja não aparece → `painel.feature`, `reports-rules.test.ts`
- **CA-REP-05** — CSV com separador `;` e vírgula decimal → `tests/unit/modules/reports/rules.test.ts` e `tests/e2e/gestao.spec.ts` (download)

## 8. Dependências
Lê (somente leitura) tabelas de Orders, Cashier, POS, Catalog, Inventory, Tables, Kitchen, Audit,
Users; usa Organizations (loja, fuso, virada) e o CMV/perdas públicos do Inventory.

## 9. Fora do escopo
Gráficos avançados (E9-5: barras simples), comparação entre lojas, metas, relatórios agendados por
e-mail, curva ABC (P1), DRE (pós-MVP).
