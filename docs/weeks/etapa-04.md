# Etapa 4 — Catálogo (`semana-4`)

Plano aprovado em 2026-09-29 com as respostas Q-09 e Q-10 e as decisões E4-1 a E4-5
(docs/requirements/perguntas-abertas.md).

## Objetivo
Montar o cardápio — categorias, produtos, adicionais — com **preço e disponibilidade por loja**.
A comanda (Etapa 6) e o caixa (Etapa 8) vendem a partir dele.

## Entregue

| Área | Entrega |
|---|---|
| Especificação | SDD `catalog` (RN-CAT-01 a 14); 16 cenários BDD em português (produtos, categorias, preço por loja, disponibilidade, adicionais) |
| Banco | Migration 0005: `category`, `product`, `product_store`, `modifier_group`, `modifier`, `product_modifier_group`; permissão `products.availability` (E4-1) |
| Kernel | Valor em reais digitado ⇄ centavos (`parseMoneyText`/`formatMoneyText`, sem ponto flutuante); `normalizeName` passou a ser comum (lojas e cardápio) |
| Casos de uso | Categoria (cadastrar, alterar, desativar, subir/descer), produto (cadastrar já com preço na loja, alterar, desativar/reativar, adicionais), preço por loja (definir, alterar, parar de vender), disponibilidade ("acabou"/"voltou"), grupos e opções de adicionais; consulta pública `listStoreMenu` para a comanda |
| Telas | Menu **Cardápio** (Produtos com busca e filtro, Categorias, Adicionais) e **Disponibilidade** (celular da cozinha/caixa) |
| Seed | Cardápio fictício (X-Burger, Parmegiana, bebidas…), com preços diferentes no Centro e na Praia; roda também em bancos antigos |

## Desvios e decisões tomadas durante a etapa

| Situação | Decisão | Onde |
|---|---|---|
| E4-5 previa instalar o shadcn/ui | **Não instalado.** As telas do cardápio só precisaram de lista, seletor e caixa de marcar nativos do navegador (acessíveis sem código extra); nenhuma janela. Regra B.12-12: sem complexidade sem necessidade. Fica para a comanda (Etapa 6), que deve precisar de janela para escolher adicionais | PROJECT_STATUS (débitos) |
| Modelo inicial tinha `sale_unit`, `deleted_at`, `station_id` em `product_store` e `sort_order` nos adicionais | Retirados: Q-10 (só unidade), E4-2 (desativar = arquivar), uma estação por loja no MVP, ordem alfabética | docs/database/modelo-de-dados.md |
| Nome do produto não era único no modelo inicial | Único na empresa (evita dois "X-Burger" na comanda) | RN-CAT-04 |
| "Acabou" poderia usar a versão do preço | **Não usa**: é valor absoluto; senão a cozinha marcando "acabou" faria o gerente que edita o preço receber "outra pessoa alterou" | RN-CAT-09 |
| Catalog precisa de lojas (Organizations) e permissão por loja (Authorization) | Usados **diretamente** — nenhum dos dois depende do Catalog, então não há ciclo nem injeção | maps/modules/dependencias.md |
| Ordem dos testes | Os casos de uso foram escritos junto com os testes (não estritamente "vermelho antes"); todos os cenários passaram a rodar antes das telas | — |

## Problemas encontrados e corrigidos
1. **Botão "Acabou" não achado pelo leitor de tela/teste.** O nome do produto ia num `span`
   escondido (`sr-only`), que usa `position: absolute`; o Chrome põe um espaço antes dele e o nome
   acessível virava "Acabou : Bolo". Correção: `aria-label` começando pelo texto visível
   ("Acabou: X-Burger").
2. **Teste E2E instável por rodar em paralelo.** Os três aparelhos (celular, tablet, computador)
   marcavam produtos com o mesmo preço ao mesmo tempo, e o texto "Esgotado · R$ 19,90" aparecia
   mais de uma vez. Correção: a conferência olha só a linha do produto do próprio teste.
3. **Visual (conferido nos prints):** a lista "Disponibilidade" ficava toda vermelha (parecia um
   alarme) → vermelho só no que está esgotado; setas ↑↓ das categorias saíam pequenas e com cor
   da fonte → botões "Subir"/"Descer" escritos; no celular, "Mostrar desativados" aparecia depois do
   botão "Filtrar" → veio para antes.

## Como experimentar (banco de desenvolvimento)
1. `npm run db:up`, `npm run db:migrate` (aplica a 0005), `npm run db:seed` (cria o cardápio
   fictício), `npm run dev`.
2. Entre como `gerente` / `Gerente@2026` → menu **Cardápio → Produtos**: abra o X-Burger, veja o
   preço do Centro, os adicionais "Ponto da carne" e "Extras"; mude o preço para 33,50.
3. Entre como `admin` / `Admin@2026` → o mesmo produto mostra o preço do Centro **e** da Praia.
4. Entre como `cozinha` / `Cozinha@2026` no celular → **Disponibilidade** → "Acabou" no Pudim.
   Ele fica esgotado só no Centro.

## Testes (2026-09-29)

| Tipo | Resultado |
|---|---|
| Unitários (regras do cardápio, valor em reais com fast-check) | ✅ 369 |
| Integração com MySQL 8.4 real (BDD + isolamento entre empresas/organizações + concorrência + auditoria) | ✅ 365 |
| E2E no navegador (celular, tablet, desktop + BDD) | ✅ 75 (4 pulados de propósito: testes só de computador ou só de celular) |

## Definition of Done
- [x] SDD e cenários BDD
- [x] Migration revisada (e aplicada no banco de desenvolvimento; índices conferidos no MySQL)
- [x] Testes unitários, integração (MySQL real), BDD, isolamento entre empresas/organizações, E2E
- [x] Lint, typecheck, build
- [ ] CI no GitHub
- [ ] Revisão do `reviewer`
- [x] Docs e maps
- [x] `PROJECT_STATUS.md`
- [ ] `APROVADO` do usuário
