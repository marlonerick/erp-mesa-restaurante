# language: pt
Funcionalidade: Disponibilidade do dia
  Para o garçom não vender o que acabou
  Como cozinha ou caixa
  Quero marcar um produto como esgotado na minha loja

  Cenário: Cozinha marca que acabou só na própria loja
    Dado que "dona" é administradora da organização
    E existe a categoria "Lanches"
    E "dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    E "dona" definiu o preço de "X-Burger" na loja "Praia" como "35,00"
    E "teo" é da cozinha na loja "Centro"
    Quando "teo" marca que "X-Burger" acabou
    Então o cardápio da loja "Centro" não tem "X-Burger"
    E o cardápio da loja "Praia" tem "X-Burger" por 3500 centavos
    E a auditoria registra o evento "PRODUCT_AVAILABILITY_CHANGED" feito por "teo"

  Cenário: Marcar de novo como disponível
    Dado que "dona" é administradora da organização
    E existe a categoria "Lanches"
    E "dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    E "teo" é da cozinha na loja "Centro"
    E "teo" marcou que "X-Burger" acabou
    Quando "teo" marca que "X-Burger" está disponível
    Então o cardápio da loja "Centro" tem "X-Burger" por 3200 centavos

  Cenário: Garçom não marca disponibilidade
    Dado que "dona" é administradora da organização
    E existe a categoria "Lanches"
    E "dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    E "joao" é garçom na loja "Centro"
    Quando "joao" tenta marcar que "X-Burger" acabou
    Então a ação é negada por falta de permissão
