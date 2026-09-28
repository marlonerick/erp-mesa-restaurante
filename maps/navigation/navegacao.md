# Navegação (proposta)

Menu filtrado pelas permissões da loja ativa. Seletor de loja no topo (troca em 1 clique).

```mermaid
flowchart TD
  L["/login"] --> H{Perfil principal}
  H -- GARCOM --> SAL["/salao — mapa de mesas"]
  H -- COZINHA --> KDS["/kds"]
  H -- CAIXA --> PDV["/pdv"]
  H -- GERENTE/ADMIN --> DASH["/dashboard"]

  SAL --> COM["/comanda/:orderId — lançar itens, enviar rodada, pedir conta"]
  PDV --> CXA["Caixa: abrir, sangria, suprimento, fechar"]
  PDV --> CONTA["Conta: pré-conta, descontos, pagamentos, divisão"]

  DASH --> CAT["/catalogo"]
  DASH --> EST["/estoque"]
  DASH --> FT["/fichas-tecnicas"]
  DASH --> FIN["/financeiro"]
  DASH --> REL["/relatorios — vendas, caixa, estoque, operação, auditoria"]
  DASH --> ADM["/admin — empresa, lojas, terminais, usuários, perfis, configurações"]
```

| Tela | Dispositivo alvo | Permissão mínima |
|---|---|---|
| Mapa de mesas / comanda | Celular | tables.read, orders.read |
| KDS | Tablet/monitor | kds.read |
| PDV | Desktop/tablet | cashier.read |
| Dashboard | Desktop | dashboard.read |
| Catálogo, estoque, fichas | Desktop | products.read / inventory.read / recipes.read |
| Financeiro, relatórios | Desktop | finance.read / reports.read |
| Admin | Desktop | users.read / stores.read |
