# Etapa 5 — Estoque e ficha técnica (`semana-5`)

Plano aprovado em 2026-09-29 com a resposta **Q-01 = A** (baixa ao enviar para a cozinha — ADR-0006
aceito) e as decisões E5-1 a E5-6 (docs/requirements/perguntas-abertas.md).

## Objetivo
Controlar os insumos por loja (saldo, custo médio, movimentações, mínimo), cadastrar a ficha
técnica de produtos e adicionais com custo teórico e margem, e deixar pronta a baixa de estoque que
a comanda da Etapa 6 vai usar.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDDs `inventory` (RN-INV-01 a 17) e `recipes` (RN-REC-01 a 06); 15 cenários BDD em português (movimentações, baixa por venda, ficha técnica) |
| Banco | Migration 0006: `ingredient`, `ingredient_unit_conversion`, `ingredient_stock`, `stock_movement` (**imutável por triggers**, como a auditoria), `recipe` (produto **ou** adicional), `recipe_item` |
| Kernel | Quantidade digitada ⇄ milésimos (`parseQuantityText`, `formatQuantityText` para leitura, `formatQuantityInput` para campos); `Quantity.times` exato |
| Estoque | Insumo por empresa, saldo por loja; entrada (quantidade + valor pago → custo médio), saída, perda com motivo, contagem (grava a diferença), mínimo com alerta, unidades de compra ("fardo" = 12 un), extrato com quem fez e o que foi digitado |
| Ficha técnica | Produto e adicional (Q-09); custo teórico com o custo médio da loja; margem sobre o preço da loja; editor de linhas |
| Baixa por venda (ADR-0006 A) | `consumeForItems` (produto + adicionais × quantidade), estorno e perda por cancelamento, política da loja (bloquear/permitir com alerta), cálculo do CMV e das perdas por dia operacional — prontos e testados para a Etapa 6 |
| Telas | Menu **Estoque** (Estoque e Fichas técnicas); lançamentos em blocos que abrem e fecham (HTML nativo), usáveis no celular |
| Seed | 14 insumos fictícios com compra inicial no Centro e na Praia e fichas dos 8 produtos e 3 adicionais do cardápio de demonstração |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| ADR-0006 dizia "cancelado depois do preparo → mantém o consumo e registra PERDA" | Uma PERDA a mais baixaria o insumo **duas vezes**. Implementado como ESTORNO + PERDA de mesmo valor: saldo igual, CMV correto, perda visível | ADR-0006 (Implementação), RN-INV-14 |
| Modelo inicial previa `deleted_at` em insumo e `unit_code` na conversão | Sem `deleted_at` (desativar = arquivar, como no cardápio); `unit_name` livre ("caixa") | docs/database/modelo-de-dados.md |
| Estorno poderia usar o custo médio de hoje | Usa o custo **do consumo**: o CMV do cancelamento zera exatamente | RN-INV-13 |
| Mínimo com versão conflitaria com qualquer movimentação | Valor absoluto, sem versão (como a disponibilidade da Etapa 4) | RN-INV-11 |
| Estoque precisa do nome de quem lançou | Usa `findUsersByIds` do módulo Users (sem ciclo) | maps/modules/dependencias.md |
| Casos de uso escritos junto com os testes | Todos os cenários e regras de borda rodaram antes das telas | — |

## Problemas encontrados e corrigidos
1. **Unidade "toString" derrubava o lançamento.** A lista de unidades é um objeto JavaScript; um
   formulário adulterado com a unidade `toString` pegava uma função herdada e o sistema quebrava
   com erro genérico em vez de recusar. Achado pelo teste unitário; correção: só chaves próprias
   (`Object.hasOwn`).
2. **Campo de quantidade com ponto de milhar (visto nos prints).** O mínimo de 1000 g aparecia no
   campo como "1.000"; como o ponto também é decimal na digitação, salvar sem mexer gravaria **1 g**
   (o mesmo na ficha técnica: 1500 g virariam 1,5 g). Correção: `formatQuantityInput` (sem milhar)
   em todo campo editável; teste de ida e volta com fast-check e teste E2E que salva duas vezes.
3. **Teste E2E ambíguo:** o rótulo "Insumo 1" também casava com o botão "Remover o insumo 1" —
   busca exata.

## Revisão do `reviewer` (2026-09-29)

1ª revisão: **reprovada** — 1 bloqueante, 3 importantes, 7 sugestões (lint, typecheck, build, 1031
testes, `drizzle-kit check` e `npm audit` passaram; nenhum float em nenhum caminho). Correções com
testes em `tests/integration/modules/inventory/review-etapa-05.test.ts`,
`tests/integration/modules/recipes/recipes-rules.test.ts`, `tests/unit/architecture/store-guard.test.ts`
e `tests/e2e/estoque.spec.ts`:

| # | Achado | Correção |
|---|---|---|
| B-1 | Dois cancelamentos simultâneos do mesmo item estornavam **em dobro** (saldo 1150 g em vez de 1000 g, CMV negativo) — reproduzido no MySQL pelo revisor | O consumo pendente é lido **com trava**; 3 testes (estorno × estorno, estorno × perda, transação que já tinha lido antes) — **falham sem a correção e passam com ela** (conferido) |
| I-1 | Ficha sem linhas aparecia como "tem ficha", custo R$ 0,00 e margem 100% | "Tem ficha" = tem linhas; primeira ficha vazia não grava nada |
| I-2 | Depois do aviso "outra pessoa alterou", o segundo clique salvava as linhas antigas por cima | O editor recarrega as linhas gravadas quando a versão muda (a mensagem continua na tela); teste E2E com duas telas |
| I-3 | Faltavam testes de isolamento, permissão e STORE_CHANGED | Cozinha × 9 casos de uso; conversão alheia; estorno de outra loja; ficha de outra empresa; venda de produto alheio; venda com adicional gravando consumo; teste que confere `requireSameStore` em 16 Server Actions |
| S-1 | Movimentação aceitava dados incoerentes se gravada por fora | Migration 0007: CHECKs (quantidade ≠ 0, sinal × tipo, motivo só em perda, origem do item) e FK de `user_id`; testes com erro 3819 |
| S-2 | 1000,5 g aparecia como "1,001 kg" (contagem errada) | kg/L só quando exato; senão mostra em g |
| S-5 | Aviso de falta repetia o insumo | Um aviso por insumo, com o total pedido |
| S-3, S-4, S-6, S-7 | Estorno no dia do cancelamento; escopo das consultas de CMV; fuso fixo no seed; entrada simultânea a uma desativação | Registrados: RN-INV-15 (S-3) e débitos no PROJECT_STATUS (S-4, S-6, S-7) |

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0006 e a 0007), `npm run db:seed` (cria insumos e fichas), `npm run dev`.
2. Entre como `gerente` / `Gerente@2026` → **Estoque** → Carne moída → "Entrada (compra)": 2 kg por
   R$ 88,00. Veja o custo médio mudar e o extrato.
3. "Contagem": informe 6,5 kg — o sistema lança só a diferença.
4. **Fichas técnicas** → X-Burger: custo, preço e margem; mude a carne para 180 g e salve.
5. Entre como `cozinha` / `Cozinha@2026`: vê estoque e fichas, sem botões de lançar.

## Testes (2026-09-29)

| Tipo | Resultado |
|---|---|
| Unitários (conversões, custo médio e consumo com fast-check, margem, texto de quantidade) | ✅ 434 |
| Integração com MySQL 8.4 real (BDD + isolamento + concorrência + imutabilidade + CMV) | ✅ 537 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 96 (4 pulados de propósito) |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (aplicada no banco de desenvolvimento; índices e triggers conferidos)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas/empresas/organizações, E2E
- [x] Lint, typecheck, build
- [x] CI no GitHub (verde no commit da implementação; conferido de novo após as correções)
- [ ] Revisão do `reviewer` (1ª reprovada; achados corrigidos — reverificação)
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
