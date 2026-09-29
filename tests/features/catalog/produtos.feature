# language: pt
Funcionalidade: Produtos do cardápio
  Para que o garçom lance os pedidos
  Como gerente
  Quero cadastrar os produtos da empresa

  Cenário: Gerente cadastra um produto com preço na loja
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    Quando "carla" cadastra o produto "X-Burger" em "Lanches" custando "32,50" nesta loja
    Então o cardápio da loja "Centro" tem "X-Burger" por 3250 centavos
    E a auditoria registra o evento "PRODUCT_CREATED" feito por "carla"

  Cenário: Nome repetido na empresa é recusado
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    E "carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,50" nesta loja
    Quando "carla" tenta cadastrar o produto "x-burger" em "Lanches"
    Então a ação é recusada com o código "PRODUCT_NAME_TAKEN"

  Cenário: Produto desativado sai do cardápio e volta com o mesmo preço
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    E "carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,50" nesta loja
    Quando "carla" desativa o produto "X-Burger"
    Então o cardápio da loja "Centro" não tem "X-Burger"
    Quando "carla" reativa o produto "X-Burger"
    Então o cardápio da loja "Centro" tem "X-Burger" por 3250 centavos

  Cenário: Garçom não cadastra produtos
    Dado que "joao" é garçom na loja "Centro"
    E existe a categoria "Lanches"
    Quando "joao" tenta cadastrar o produto "X-Salada" em "Lanches"
    Então a ação é negada por falta de permissão
