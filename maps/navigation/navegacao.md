# Navegação

Menu lateral (E3-4, implementado na Etapa 3 — `src/app/(app)/sidebar.tsx`), filtrado pelas
permissões da loja ativa; o servidor bloqueia de novo em cada tela.

| Aparelho | Comportamento |
|---|---|
| Computador (≥ 1280 px) | Menu fixo à esquerda, aberto; botão "Recolher menu" deixa só os ícones (lembrado em cookie) |
| Tablet (768–1279 px) | Começa recolhido (só ícones); "Expandir menu" abre |
| Celular (< 768 px) | Barra no topo com ☰; o menu abre como gaveta (`<dialog>`: foco preso, Esc fecha) |

Estrutura: seletor de loja no topo (loja ativa + terminal do aparelho; troca em 1 clique —
RN-ORG-12) · grupos **Operação** (Início, Salão, Cozinha, PDV, Caixa, Disponibilidade), **Cardápio**
(Produtos, Categorias, Adicionais — Etapa 4), **Estoque** (Estoque, Fichas técnicas — Etapa 5) e
**Administração** (Usuários, Empresa, Lojas,
Terminais) · rodapé com a conta (Meu PIN, Trocar senha, Trocar usuário, Sair).
Página atual com `aria-current="page"`. A tela da cozinha (Etapa 7) fica dentro do menu; no tablet
ele começa recolhido (só ícones), o que deixa espaço para 2–3 colunas de pedidos.

Mapa de telas planejado (MVP):

```mermaid
flowchart TD
  L["/login"] --> H{Perfil principal}
  H -- GARCOM --> SAL["/salao — mapa de mesas"]
  H -- COZINHA --> KDS["/cozinha"]
  H -- CAIXA --> PDV["/pdv"]
  H -- GERENTE/ADMIN --> DASH["/dashboard"]

  SAL --> COM["/comanda/:orderId — lançar itens, enviar rodada, pedir conta"]
  PDV --> CXA["/caixa — abrir, sangria, suprimento, fechar às cegas (/caixa/:id = resultado)"]
  PDV --> CONTA["/pdv/conta/:orderId — pré-conta, descontos, taxa, pagamentos, divisão"]

  DASH --> CAT["/catalogo"]
  DASH --> EST["/estoque"]
  DASH --> FT["/fichas-tecnicas"]
  DASH --> FIN["/financeiro"]
  DASH --> REL["/relatorios — vendas, caixa, estoque, operação, auditoria"]
  DASH --> ADM["/admin — empresa, lojas, terminais, usuários, perfis, configurações"]
```

| Tela | Dispositivo alvo | Permissão mínima |
|---|---|---|
| Mapa de mesas `/salao` e comanda `/salao/comanda/:id` (abrir, lançar, enviar, cancelar com PIN, pedir conta, transferir, juntar, separar, balcão) — Etapa 6 | Celular (Q-15) | tables.read, orders.read (lançar: orders.create; mexer na conta: orders.update; cancelar enviado: orders.cancel ou PIN do gerente) |
| Cadastro de mesas `/mesas`, `/mesas/:id` — Etapa 6 | Desktop/tablet | tables.configure (E6-2) |
| Cozinha (KDS) `/cozinha` — fila, cronômetro, iniciar/pronto/tudo pronto, desfazer, imprimir 80 mm (Etapa 7) | Tablet de 10" deitado (Q-15) | kds.read (marcar e imprimir: kds.manage) |
| PDV `/pdv` (contas a receber) e `/pdv/conta/:id` — Etapa 8 | Computador ou tablet do caixa | payments.create ou cashier.read (receber: payments.create + caixa aberto no terminal) |
| Caixa `/caixa`, `/caixa/:id` — Etapa 8 | Terminal de caixa (E8-2) | cashier.read (abrir/movimentar/fechar: cashier.open/movement/close) |
| Dashboard | Desktop | dashboard.read |
| Cardápio: `/catalogo/produtos`, `/catalogo/categorias`, `/catalogo/adicionais` (Etapa 4) | Desktop (funciona no celular) | products.update (cadastrar: products.create) |
| Disponibilidade `/disponibilidade` — "acabou"/"voltou" (Etapa 4) | Celular/tablet da cozinha ou do caixa | products.availability |
| Estoque `/estoque`, `/estoque/:id` (lançar, extrato, mínimo, unidades) — Etapa 5 | Desktop; contagem no celular | inventory.read (lançar: inventory.manage) |
| Fichas técnicas `/fichas-tecnicas`, `/fichas-tecnicas/produto/:id`, `/fichas-tecnicas/adicional/:id` — Etapa 5 | Desktop | recipes.read (salvar: recipes.manage) |
| Financeiro, relatórios | Desktop | finance.read / reports.read |
| Admin — usuários | Desktop | users.read |
| Admin — empresa e lojas (Etapa 3) | Desktop | stores.manage |
| Admin — terminais (Etapa 3) | No próprio aparelho | terminals.manage |
