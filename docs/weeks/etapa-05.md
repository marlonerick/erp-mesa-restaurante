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

## Como experimentar (banco de desenvolvimento)
1. `npm run db:migrate` (aplica a 0006), `npm run db:seed` (cria insumos e fichas), `npm run dev`.
2. Entre como `gerente` / `Gerente@2026` → **Estoque** → Carne moída → "Entrada (compra)": 2 kg por
   R$ 88,00. Veja o custo médio mudar e o extrato.
3. "Contagem": informe 6,5 kg — o sistema lança só a diferença.
4. **Fichas técnicas** → X-Burger: custo, preço e margem; mude a carne para 180 g e salve.
5. Entre como `cozinha` / `Cozinha@2026`: vê estoque e fichas, sem botões de lançar.

## Testes (2026-09-29)

| Tipo | Resultado |
|---|---|
| Unitários (conversões, custo médio e consumo com fast-check, margem, texto de quantidade) | ✅ 418 |
| Integração com MySQL 8.4 real (BDD + isolamento + concorrência + imutabilidade + CMV) | ✅ 520 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 93 (4 pulados de propósito) |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (aplicada no banco de desenvolvimento; índices e triggers conferidos)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre lojas/empresas/organizações, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub
- [ ] Revisão do `reviewer`
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
