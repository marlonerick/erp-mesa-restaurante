# Etapa 9 — Financeiro básico, painel e relatórios (`semana-9`)

Plano aprovado em 2026-10-05 com as decisões **E9-1** a **E9-7** (docs/requirements/perguntas-abertas.md):
venda no dia operacional do fechamento (o do caixa que recebeu), categorias iniciais, financeiro só
para gerente e admin, caixa vê o painel (sem o esperado), barras simples sem biblioteca, CSV + impressão
pelo navegador e margem por produto com o custo da ficha no momento da venda.

## Objetivo
O dono vê quanto entrou e quanto saiu: as vendas entram sozinhas no financeiro ao fechar o caixa,
despesas e contas a pagar são lançadas à mão, e o fluxo de caixa mostra o saldo dia a dia. Na tela
inicial, um painel do dia; em Relatórios, vendas, produtos com margem, caixa, estoque, operação e
auditoria — com CSV para o Excel e impressão.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDDs `finance` (RN-FIN-01 a 08) e `reports` (RN-REP-01 a 09); 3 arquivos BDD (financeiro, painel, relatórios) |
| Banco | Migration 0012: `finance_category` (por empresa; `Vendas` do sistema), `finance_entry` (por loja; previsto/pago/cancelado; origem manual ou caixa; uma receita por caixa e forma), `customer_order.closed_date` com preenchimento das contas já fechadas e índices dos relatórios; 4 CHECKs |
| Módulo Finance (novo) | Categorias (criadas na primeira vez que a empresa usa; nome único sem diferenciar maiúsculas; desativar), lançamentos (idempotentes; competência, vencimento, pagamento; pagar; cancelar com motivo; receita do caixa não é alterada), fluxo de caixa (dia do pagamento, saldo e acumulado; a pagar/receber em 30 dias, vencidas primeiro) |
| Cashier | No fechamento, na mesma transação, cria uma receita por forma de pagamento com total líquido positivo (vendas − estornos), no dia operacional do caixa |
| Orders / POS | A conta guarda o dia operacional do fechamento (`closed_date`) = o do caixa que recebeu (E9-1) |
| Módulo Reports (novo, só leitura) | Painel do dia; vendas por dia, categoria e forma de pagamento; vendas por produto com custo e margem (E9-7); caixas com conferência (só dos fechados); estoque (saldo, mínimo, movimentações, CMV, perdas); operação; auditoria com filtros. Toda consulta filtra a loja; CSV até 10.000 linhas |
| Núcleo | Datas locais e períodos (`parseLocalDate`, `addDays`, `validatePeriod` — até 366 dias), início do dia operacional em UTC (`operationalDayStart`) |
| Audit | 5 eventos do financeiro; nome em português de cada evento para o relatório |
| Telas | **Início** com o painel do dia (atualiza a cada 30 s); **Financeiro** (lançamentos com filtros e paginação, fluxo de caixa, categorias); **Relatórios** (6 abas, período, barras, tabelas, CSV, imprimir) |
| Menu | Grupo **Gestão**: Financeiro (finance.read) e Relatórios (reports.read) |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| Cenário "venda no dia do fechamento" usava o caixa aberto no dia 14 recebendo às 06:00 do dia 15 | Pela E9-1 essa venda é do dia 14 (dia do caixa). O cenário passou a fechar o caixa do dia 14 e abrir outro no dia 15, que recebe — a conta aberta no dia 14 conta no dia 15 | `relatorios.feature` |
| Painel em `/dashboard` (mapa antigo) | O painel fica na tela **Início** (quem tem `dashboard.read` vê ao entrar); sem tela nova | navegacao.md |
| Categorias iniciais no seed | Criadas sob demanda na primeira leitura do financeiro da empresa (vale também para empresas novas) | finance.md RN-FIN-02 |
| CSV "sem página" traria a tabela inteira | O caso de uso limita a 10.000 linhas na consulta (RN-REP-09) | reports.ts |
| A impressão da Etapa 7 escondia tudo que não fosse a via da cozinha (o relatório sairia em branco) | A regra só vale quando a via está na página (`body:has(> .area-impressao)`); menu lateral com `print:hidden` | globals.css, sidebar.tsx |
| Chave de idempotência por intenção duplicada nas telas | `useIntentKey` foi para `src/ui/intent-key.ts` (caixa e financeiro usam) | — |
| Receita do caixa errada | Não se cancela pelo financeiro: estorna-se o pagamento no PDV antes de fechar o caixa | RN-FIN-03 |
| Conta fechada sem pagamento (cortesia) antes da Etapa 9 | A migration usa o dia da **abertura**; o código novo usa o dia do fechamento. Diferença só nas cortesias antigas, aceita | migration 0012, `closed-date-backfill.test.ts` |
| Painel do caixa | Sem vendas do dia nem ticket médio (E9-4 "sem valores financeiros detalhados"): o servidor manda `null` — achado B-1 | RN-REP-03 |

## Problemas encontrados e corrigidos
1. **Relatório impresso em branco** (achado ao montar a tela): ver tabela acima.
2. **Teste de navegador**: mais de 5 logins **simultâneos** do mesmo usuário esbarram no limite de
   tentativas (a tentativa é reservada antes de conferir a senha, que é lenta de propósito). O teste
   do garçom passou a usar a Ana; a regra (proteção contra adivinhação de senha) não mudou.
3. Cenário do painel tinha o mesmo passo duas vezes no mesmo cenário (a biblioteca de BDD não
   aceita): o garçom virou um cenário próprio.

## Revisão do `reviewer` (2026-10-05)

1ª revisão (commit ac1b9c3): **aprovada com ressalvas** — 1 bloqueante, 5 importantes, 10 sugestões.
O revisor conferiu o filtro de loja em todas as consultas, as permissões, o fechamento cego no
relatório de caixa e no CSV, o preenchimento de `closed_date`, a receita única por caixa e forma, os
cálculos e a regra de impressão. Correções:

| # | Achado | Correção |
|---|---|---|
| B-1 | O CAIXA via **vendas do dia e ticket médio** no painel: com a maquininha, estimaria o dinheiro esperado na gaveta antes do fechamento cego — e a E9-4 aprovada diz "sem valores financeiros detalhados" | O servidor manda esses valores como `null` para quem não tem `reports.read`; a tela esconde os cartões; RN-REP-03, cenário BDD e E2E ajustados |
| I-1 | CSV: texto como `-1+1` passava sem proteção e o Excel executaria como fórmula | Todo texto começando com `= + - @`, tab ou CR ganha apóstrofo, menos números como `-5,50`; teste |
| I-2 | CSV não conferia a loja da tela (duas abas → arquivo de outra loja) | Link leva `loja=`; a rota chama `requireScreenStore` (409); nome do arquivo com a loja; E2E |
| I-3 | Custo por produto somava todo o histórico de estoque da loja, também no painel a cada 30 s | Subconsulta só com os itens vendidos no período; "mais vendidos" do painel em consulta própria, sem custo |
| I-4 | Sem CSV de Operação e de vendas por categoria | Criados |
| I-5 | Faltavam testes do preenchimento de `closed_date` e de isolamento (estoque, partes do painel, formas de pagamento, outra empresa) | `closed-date-backfill.test.ts` (roda o UPDATE da migration); testes de isolamento por consulta e com outra empresa |
| S-1 | Reenviar "pagar" dava "outra pessoa alterou"; pagamento no futuro era aceito | Já pago = nada muda; data de pagamento até hoje; testes |
| S-2 | Soma das vendas do fechamento lida sem trava | `for('share')` |
| S-3 | `/relatorios/csv/constructor` dava erro 500 | `Object.hasOwn` → 404; E2E |
| S-4 | 9 gravações nas categorias em cada leitura do financeiro | Só grava se faltar categoria inicial |
| S-5 | Teste de permissão aceitava qualquer erro | Exige `FORBIDDEN` |
| S-6 | Cortes calados (a vencer em 200, CSV em 10.000) | Aviso na tela e na última linha do CSV |
| S-7 | Relatório de caixa carregava todas as movimentações | Somas no banco; só as em dinheiro dos caixas fechados para os alertas |
| S-8 | Cortesias antigas no dia da abertura | Documentado (tabela acima) |
| S-9 | Painel com erro derrubava a tela Início; links de página pequenos; SDD citava Kitchen | Painel some e registra o erro; links com 48 px; SDD e mapa corrigidos |
| S-10 | Reports importa outros módulos direto; Finance recebe por injeção | Débito técnico (padronizar) |

2ª revisão (reverificação, commit 165b1a6): **aprovada** — B-1, I-1 a I-5 e S-1 a S-9 conferidos;
S-10 como débito. Novas sugestões, sem impedir a conclusão:

| # | Achado | Decisão |
|---|---|---|
| S-11 | Aviso de limite também com exatamente 10.000 linhas (nada cortado) | Débito técnico (impacto desprezível) |
| S-12 | O CSV só confere a loja quando o endereço traz `loja=` (favorito antigo baixa da loja ativa) | Débito técnico — mesmo comportamento das leituras automáticas; não vaza dados (a pessoa tem acesso às duas lojas) |

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0012) e `npm run dev`.
2. Como `gerente` / `Gerente@2026`: a tela **Início** mostra o painel do dia.
3. Faça uma venda e feche o caixa (passos da Etapa 8). Em **Gestão → Financeiro** aparecem as
   receitas "Vendas do caixa de dd/mm/aaaa", uma por forma de pagamento.
4. Lance uma despesa **a pagar** ("Conta de luz", R$ 350,00, vencimento daqui a 5 dias) e veja em
   **Fluxo de caixa → A pagar e a receber**. Depois toque em **Marcar como paga**.
5. **Gestão → Relatórios**: troque o período e as abas; baixe um **CSV** (abre direto no Excel) e
   toque em **Imprimir** (também serve para salvar em PDF).
6. Como `caixa` / `Caixa@2026`: o painel aparece no Início **sem os valores de venda**; Financeiro e
   Relatórios não aparecem.

## Testes (2026-10-05)

| Tipo | Resultado |
|---|---|
| Unitários (períodos e dia operacional com fast-check, valores e datas do financeiro, fluxo com acumulado, ticket médio, margem, CSV com proteção contra fórmula) | ✅ 570 |
| Integração com MySQL 8.4 real (BDD dos 3 arquivos + isolamento entre lojas + idempotência + estorno no fechamento + categoria do sistema + concorrência + permissões) | ✅ 1512 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 153 (4 pulados de propósito), duas execuções completas seguidas |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (tabelas → colunas → preenchimento → índices → FKs; `drizzle-kit check`)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [x] CI no GitHub (verde na implementação e nas correções)
- [x] Revisão do `reviewer` (1ª aprovada com ressalvas; achados corrigidos; reverificação **aprovada**)
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
