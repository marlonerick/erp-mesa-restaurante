# Cenários de falha obrigatórios (README B.11) — onde cada um é testado

Conferido na Etapa 10 (2026-10-06). "Integração" = Vitest com MySQL 8.4 real; "navegador" =
Playwright (celular, tablet, computador). Todos rodam no CI a cada envio para a `main`.

| # | Cenário | Testes |
|---|---|---|
| 1 | Acesso sem permissão | Integração: `permissoes.feature` e o código `FORBIDDEN` em cada módulo (ex.: `financeiro.feature` "O caixa não vê o financeiro", `painel.feature`, `reports-rules.test.ts` "o caixa vê o painel, mas não os relatórios"). Navegador: "garçom não acessa a administração de usuários", "o garçom não vê PDV nem caixa", "o caixa vê o painel do dia, mas não o financeiro nem os relatórios" (também a rota do CSV → 403) |
| 2 | Acesso a outra loja | Integração: testes de isolamento de todos os módulos (`*-rules.test.ts`: "o caixa da Praia não vê nem recebe a conta do Centro", "o gerente da Praia não vê vendas, caixas nem auditoria do Centro", "o gerente de OUTRA empresa não vê categorias nem lançamentos desta"…). Navegador: "gerente da loja Centro não vê a equipe da loja Praia"; CSV com a loja da tela diferente → 409 |
| 3 | Produto desativado durante o pedido | Integração: `comanda.feature` "Produto desativado durante o pedido" (o item já lançado segue com o preço congelado; lançar outro → `PRODUCT_NOT_AVAILABLE`) e "Produto esgotado não pode ser lançado" |
| 4 | Pagamento duplicado | Integração: `pagamento.feature` "Pagamento reenviado por perda de conexão não duplica"; `pos-rules.test.ts` "o reenvio do pagamento ao mesmo tempo que o original não duplica" e "dois caixas recebendo o que falta ao mesmo tempo". Navegador: `falhas.spec.ts` "internet cai ao receber" |
| 5 | Cancelamento antes e depois do preparo | Integração: `cancelamento.feature` ("Gerente autoriza com PIN e o insumo volta ao estoque", "Cancelado depois do preparo vira perda") e `baixa-por-venda.feature` |
| 6 | Perda de conexão no envio do pedido e do pagamento | Integração: `envio-para-cozinha.feature` "Reenviar com a mesma chave não duplica"; `pagamento.feature` (reenvio). Navegador: `falhas.spec.ts` "internet cai ao enviar o pedido" e "internet cai ao receber" — a tela avisa "Sem conexão…" e mantém a chave (Etapa 10) |
| 7 | Edição simultânea da mesma conta | Integração: `orders-rules.test.ts` "dois garçons lançando ao mesmo tempo"; `envio-para-cozinha.feature` "Item enviado por outro garçom enquanto a tela estava aberta"; `pos-rules.test.ts` "dois caixas recebendo o que falta ao mesmo tempo" e "receber enquanto o caixa fecha"; código `CONCURRENT_MODIFICATION` nas telas com versão |
| 8 | Divergência de caixa | Integração: `caixa.feature` "Fechamento cego mostra a diferença", "Dinheiro que não bate pede uma recontagem", "Só uma recontagem"; `relatorios.feature` "Relatório de caixa com a diferença do fechamento". Navegador: `pdv.spec.ts` "fechamento: contador de cédulas e uma recontagem" |
| 9 | Estoque insuficiente (nas duas políticas) | Integração: `envio-para-cozinha.feature` "Sem estoque e com política de bloquear, nada é enviado" e "… de permitir, envia e avisa o garçom" |
| 10 | Sessão expirada no meio da operação | Integração: `sessao.feature` (12 h sem uso, 7 dias, aparelho compartilhado, usuário desativado). Navegador: `falhas.spec.ts` "sessão expirada no meio da comanda: volta ao login e nada se perde"; leituras automáticas devolvem 401 e a tela recarrega para o login |
| 11 | Virada do dia operacional após a meia-noite | Unitário: `dia-operacional.feature` (virada às 05:00, fuso da loja) e `period.test.ts` (início do dia operacional). Integração: `relatorios.feature` "Venda conta no dia operacional do fechamento" |

## Achado da Etapa 10
Com a internet caindo no toque de "Enviar" ou "Receber", a tela inteira era trocada pela página de
erro do Next (em inglês) e a chave de idempotência se perdia ao recarregar. Corrigido:
`useServerAction` (`src/ui/use-server-action.ts`) mostra "Sem conexão…" no próprio formulário e
mantém a chave; páginas de erro em português (`src/app/(app)/error.tsx`, `src/app/global-error.tsx`).
