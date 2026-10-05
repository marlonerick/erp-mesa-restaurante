# Etapa 8 — PDV e caixa (`semana-8`)

Plano aprovado em 2026-10-01 com as respostas **Q-06** (taxa depois dos descontos, sobre todos os
produtos, sem taxa no balcão), **Q-07** (desconto: garçom 0%, caixa 10%, gerente/admin 100%), **Q-16**
(fechamento cego: dinheiro obrigatório, cartão e PIX opcionais), **Q-17** (couvert e afins fora do
MVP) e as decisões E8-1 a E8-5 (docs/requirements/perguntas-abertas.md).

## Objetivo
O caixa abre o caixa no terminal, emite a pré-conta, aplica taxa e desconto, recebe pagamentos
(misto e conta dividida) e a conta fecha sozinha quando está paga; no fim do dia fecha o caixa às
cegas e vê a diferença. Cada pagamento é registrado uma única vez, mesmo com a internet caindo.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDDs `cashier` (RN-CASH-01 a 09) e `pos` (RN-POS-01 a 16); 4 arquivos BDD (caixa, conta, pagamento, divisão) |
| Banco | Migration 0011: `cash_session` (um caixa aberto por terminal pela coluna calculada), `cash_movement`, `cash_session_count`, `payment`, `payment_allocation`; conta com taxa congelada, desconto, pago, pré-conta e valores do fechamento; desconto no item; 12 CHECKs (troco só no dinheiro, conta fechada = paga por inteiro, diferença do fechamento…) |
| Módulo Cashier (novo) | Abrir (terminal de caixa — E8-2 —, limite de caixas da loja), sangria e suprimento com motivo, fechamento cego com esperado/informado/diferença, venda e estorno para o PDV |
| Módulo POS (novo) | Contas a receber, conta (itens, descontos, taxa, total, pago, falta), pré-conta, desconto no item/conta com limite do perfil e PIN do gerente, retirar/devolver taxa, receber (idempotente, troco no dinheiro, confirmação manual de PIX/cartão), divisão por pessoas e por itens, cancelar pagamento com PIN, fechamento automático com mesas para limpeza |
| Orders | Taxa de serviço congelada na abertura (mesa = loja; balcão = 0); com pagamento, não cancela item nem junta conta; API `billingOrders` para o PDV |
| Authorization | Limite de desconto do usuário na loja (o maior entre os perfis) |
| Telas | **Caixa** (abrir, sangria/suprimento, fechar às cegas; resultado em `/caixa/:id`), **PDV** (contas a receber) e **Conta** (pré-conta em 80 mm com "NÃO É DOCUMENTO FISCAL", descontos e taxa com PIN do gerente quando precisa, pagamentos, troco, divisão) |
| Menu | "PDV" e "Caixa" para caixa, gerente e admin |
| Seed | Loja Centro de demonstração aceita 5 caixas abertos (só em banco novo — os testes de navegador abrem um caixa por aparelho) |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| Modelo previa `payment.idempotency_key` com índice único | A chave fica na tabela de idempotência da Etapa 1 (`executeIdempotent`), como em todos os comandos | modelo-de-dados.md |
| Modelo previa `payment.provider` | `reference` opcional (NSU, código do PIX); a confirmação manual é a porta `PaymentProvider` mínima — integração (PSP/TEF) é P2 | pos.md RN-POS-08 |
| Quando a taxa da loja muda, contas abertas mudam? | Não: a taxa é **congelada na abertura** (como o preço do item); contas já abertas na migração receberam a taxa da loja | RN-POS-03, migration 0011 |
| Desconto/taxa depois de pagamento | Recusado (`PAYMENTS_STARTED`): deixaria o pago maior que a conta. Corrige-se cancelando os pagamentos | RN-POS-07 |
| Comanda com pagamento | Não cancela item nem junta com outra conta; lançar mais continua valendo | RN-POS-15 |
| Divisão por pessoas | A tela divide o que falta (os centavos vão para as primeiras partes) e preenche o valor; o servidor só confere que não passa do que falta | RN-POS-13 |
| Fechamento cego | Antes de fechar, a tela do caixa **não mostra vendas nem esperado** — só sangrias e suprimentos | RN-CASH-06 |
| Telas do PDV e do caixa | Sem leitura automática (o caixa age e a tela se atualiza na hora; outro caixa na mesma conta é raro). A conta usa as travas para nunca cobrar duas vezes | — |
| `Jsonified` desmontava ids | Texto, número e booleano passam direto (ajuste no núcleo da idempotência) | idempotency.ts |

## Problemas encontrados e corrigidos
1. **Dois caixas cobrando a mesma conta** (risco R-03): conferido que o teste dos dois caixas ao
   mesmo tempo **falha sem a trava da conta** (as duas cobranças passam) e passa com ela.
2. **Troco sumia da tela**: quando o último pagamento fechava a conta, o painel de pagamento sumia
   junto com a mensagem "Troco: R$ 1,50". O painel agora fica no lugar mostrando o resultado
   (achado no teste de navegador).
3. Teste de navegador: o botão de rádio da forma de pagamento é escondido (a pessoa toca no rótulo
   grande); as opções do tipo de desconto tinham o mesmo nome do campo de valor ("Percentual (%)")
   e viraram "Em %" / "Em R$".

## Revisão do `reviewer` (2026-10-02)

1ª revisão: **reprovada** — 2 bloqueantes, 5 importantes, 9 sugestões (lint, typecheck, 548
unitários, 1326 de integração e `drizzle-kit check` passaram; `npm audit` só com a exceção já
registrada). O revisor confirmou que a idempotência, a trava da conta e a proteção contra cobrança em
dobro estão corretas. Correções:

| # | Achado | Correção |
|---|---|---|
| B-1 | Quem não tem `discounts.apply` (ex.: COZINHA) **retirava** o desconto da conta mandando valor zero: limite 0 e desconto 0 "não passavam do limite" | Sem `discounts.apply`, todo desconto — inclusive retirar — exige o gerente; teste com cozinha e garçom **falha sem a correção** |
| B-2 | **Duas sangrias ao mesmo tempo** passavam e a gaveta ficava negativa (−R$ 60): a soma das movimentações era lida da "foto" anterior à trava | A soma é lida **com trava** depois de travar o caixa; teste com sangrias em paralelo **falha sem a correção**; teste de sangria × estorno |
| I-1 | Pagar por itens depois de um pagamento por valor dava "erro inesperado" (parte negativa) | Itens marcados = todos os que faltam → cobra exatamente o que falta; senão, `ITEMS_EXCEED_BALANCE`; partes zeradas → `NOTHING_TO_PAY` (`fitShares`, com fast-check) |
| I-2 | Conta com cortesia de 100% nunca fechava | "Fechar conta sem valor" (RN-POS-12a); teste |
| I-3 | A recusa da sangria acima do esperado deixa descobrir o esperado (tentativa e erro) | **Decisão do usuário (E8-6): aceitar** a sangria, marcar na auditoria e apontar ao gerente na conferência do fechamento (só depois de fechar); cenário BDD reescrito, testes de sangrias simultâneas e de conferência |
| I-4 | Consultas de pagamentos, divisão, itens, movimentações e contagem sem filtro de loja | Todas recebem a loja (contagem pela junção com o caixa) |
| I-5 | Faltavam testes e o SDD apontava arquivo inexistente | `cashier-rules.test.ts` criado; testes de `NO_SERVICE_FEE`, `TENDERED_TOO_LOW`, `PAYMENT_ALREADY_CANCELLED`, `IDEMPOTENCY_KEY_REUSED`, isolamento de desconto/pré-conta/taxa/cancelar/fechar caixa |
| S-1 | Ordem das travas na documentação | conta → caixa → mesas (pos.md, orders.md) |
| S-2 | Descontos somados (item + conta) passam do limite do perfil | **Decisão do usuário (E8-7): limite na soma** dos descontos da conta sobre o valor dos itens; diminuir é livre; a janela já calcula pela soma; teste |
| S-3 | Centavo de arredondamento na divisão por itens | Resolvido junto com I-1 |
| S-4 | O preenchimento da taxa na migration também alcança contas fechadas/canceladas | Sem efeito: antes da 0011 não existiam contas fechadas e as canceladas não têm valor; a migration já aplicada não foi alterada |
| S-5 | Índices sem `store_id` na frente; tabelas filhas sem `store_id` | Débito técnico (as consultas já filtram a loja) |
| S-6 | Forma de pagamento escolhida só pela cor; foco do teclado invisível | ✓ na escolhida e contorno de foco no rótulo |
| S-7 | Horário da conta no fuso do servidor | Usa o fuso da loja |
| S-8 | Import duplicado no seed | Variável local renomeada |
| S-9 | Data do PROJECT_STATUS | Atualizada |

2ª revisão (reverificação, commit b93c759): **aprovada com ressalvas** — B-1, B-2, I-1, I-2, I-4 e
I-5 conferidos; 549 unitários e 1335 de integração passando. Novos:

| # | Achado | Correção |
|---|---|---|
| I-1 | Faltaria teste de "não cancela item com pagamento" (RN-POS-15) | Já coberto pelo cenário BDD "Com pagamento na conta, a comanda não cancela item" (`pagamento.feature`), que chama o cancelamento real do Orders |
| S-1 | "Fechar sem valor" fecharia conta vazia como venda de R$ 0,00 | Exige item com valor; senão `BILL_EMPTY` (cancela-se na comanda); teste |
| S-2 | Estorno em dinheiro pode deixar o esperado negativo | Débito no PROJECT_STATUS (avaliar no piloto) |

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0011) e `npm run dev`.
2. Como `gerente` / `Gerente@2026`: **Administração → Terminais** → cadastre um terminal do tipo
   Caixa e toque em **Usar este aparelho**. Saia.
3. Como `caixa` / `Caixa@2026` (no mesmo navegador): **Caixa** → fundo de troco → **Abrir caixa**.
4. Como `joao` (outro navegador): **Salão → mesa 2 → Enviar para a cozinha**.
5. No caixa: **PDV → Mesa 2** → **Emitir pré-conta** (imprime 80 mm) → receba parte no **PIX**
   (marque "Confirmei…") e o resto em **Dinheiro** com um valor maior: veja o **troco**. A conta
   fecha e a mesa vai para limpeza.
6. Teste um **desconto de 20%**: a janela pede o usuário e o PIN do gerente (`gerente` / `739104`).
7. **Caixa → Fechar caixa**: informe o dinheiro contado e veja esperado, informado e diferença.

## Testes (2026-10-02)

| Tipo | Resultado |
|---|---|
| Unitários (conta e taxa com fast-check, desconto e limite, troco, divisão por pessoas e por itens, esperado e fechamento cego) | ✅ 550 |
| Integração com MySQL 8.4 real (BDD + dois caixas na mesma conta + pagar × fechar caixa + duas aberturas + duas sangrias + reenvio simultâneo + isolamento + CHECKs) | ✅ 1339 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 141 (4 pulados de propósito), duas execuções completas seguidas |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (índices antes das FKs; aplicada no banco de desenvolvimento)
- [x] Testes unitários, integração (MySQL real), BDD, concorrência, isolamento entre lojas, E2E
- [x] Lint, typecheck, build
- [x] CI no GitHub (verde na implementação e nas correções)
- [x] Revisão do `reviewer` (1ª reprovada; achados corrigidos; reverificação **aprovada**; I-3 e S-2 decididos e aplicados)
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [x] `APROVADO` do usuário (2026-10-05, com as decisões E8-6 e E8-7)
