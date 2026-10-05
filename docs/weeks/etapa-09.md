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

## Problemas encontrados e corrigidos
1. **Relatório impresso em branco** (achado ao montar a tela): ver tabela acima.
2. **Teste de navegador**: mais de 5 logins **simultâneos** do mesmo usuário esbarram no limite de
   tentativas (a tentativa é reservada antes de conferir a senha, que é lenta de propósito). O teste
   do garçom passou a usar a Ana; a regra (proteção contra adivinhação de senha) não mudou.
3. Cenário do painel tinha o mesmo passo duas vezes no mesmo cenário (a biblioteca de BDD não
   aceita): o garçom virou um cenário próprio.

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0012) e `npm run dev`.
2. Como `gerente` / `Gerente@2026`: a tela **Início** mostra o painel do dia.
3. Faça uma venda e feche o caixa (passos da Etapa 8). Em **Gestão → Financeiro** aparecem as
   receitas "Vendas do caixa de dd/mm/aaaa", uma por forma de pagamento.
4. Lance uma despesa **a pagar** ("Conta de luz", R$ 350,00, vencimento daqui a 5 dias) e veja em
   **Fluxo de caixa → A pagar e a receber**. Depois toque em **Marcar como paga**.
5. **Gestão → Relatórios**: troque o período e as abas; baixe um **CSV** (abre direto no Excel) e
   toque em **Imprimir** (também serve para salvar em PDF).
6. Como `caixa` / `Caixa@2026`: o painel aparece no Início, mas Financeiro e Relatórios não.

## Testes (2026-10-05)

| Tipo | Resultado |
|---|---|
| Unitários (períodos e dia operacional com fast-check, valores e datas do financeiro, fluxo com acumulado, ticket médio, margem, CSV com proteção contra fórmula) | ✅ 570 |
| Integração com MySQL 8.4 real (BDD dos 3 arquivos + isolamento entre lojas + idempotência + estorno no fechamento + categoria do sistema + concorrência + permissões) | ✅ 1505 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 153 (4 pulados de propósito), duas execuções completas seguidas |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (tabelas → colunas → preenchimento → índices → FKs; `drizzle-kit check`)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub
- [ ] Revisão do `reviewer`
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
