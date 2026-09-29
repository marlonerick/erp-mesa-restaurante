# language: pt
Funcionalidade: Categorias do cardápio
  Para organizar o cardápio na ordem em que o cliente lê
  Como gerente
  Quero cadastrar, ordenar e desativar categorias

  Cenário: Categoria nova entra no fim e pode subir
    Dado que "carla" é gerente na loja "Centro"
    E existem as categorias "Lanches", "Bebidas" e "Sobremesas"
    Quando "carla" sobe a categoria "Sobremesas"
    Então a ordem das categorias é "Lanches", "Sobremesas", "Bebidas"

  Cenário: Categoria desativada tira os produtos dela do cardápio
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Sobremesas"
    E "carla" cadastrou o produto "Pudim" em "Sobremesas" custando "12" nesta loja
    Quando "carla" desativa a categoria "Sobremesas"
    Então o cardápio da loja "Centro" não tem "Pudim"
    E o produto "Pudim" continua ativo

  Cenário: Categoria desativada não recebe produto novo
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Sobremesas"
    E "carla" desativou a categoria "Sobremesas"
    Quando "carla" tenta cadastrar o produto "Mousse" em "Sobremesas"
    Então a ação é recusada com o código "CATEGORY_INACTIVE"
