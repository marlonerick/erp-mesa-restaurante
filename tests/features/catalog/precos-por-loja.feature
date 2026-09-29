# language: pt
Funcionalidade: Preço por loja
  Para cobrar de acordo com cada ponto de venda
  Como gerente
  Quero definir o preço do produto em cada loja

  Cenário: O mesmo produto com preços diferentes em duas lojas
    Dado que "dona" é administradora da organização
    E existe a categoria "Lanches"
    E "dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    Quando "dona" define o preço de "X-Burger" na loja "Praia" como "35,00"
    Então o cardápio da loja "Centro" tem "X-Burger" por 3200 centavos
    E o cardápio da loja "Praia" tem "X-Burger" por 3500 centavos

  Cenário: Produto sem preço na loja não é vendido nela
    Dado que "dona" é administradora da organização
    E existe a categoria "Lanches"
    E "dona" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    Então o cardápio da loja "Praia" não tem "X-Burger"

  Cenário: Gerente de uma loja não altera o preço de outra
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    E "carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    Quando "carla" tenta definir o preço de "X-Burger" na loja "Praia" como "1,00"
    Então a ação é negada por falta de permissão

  Cenário: Dois gerentes alteram o mesmo preço ao mesmo tempo
    Dado que "carla" é gerente na loja "Centro"
    E existe a categoria "Lanches"
    E "carla" cadastrou o produto "X-Burger" em "Lanches" custando "32,00" nesta loja
    E duas telas abertas mostram o preço de "X-Burger" no "Centro"
    Quando a primeira tela salva "33,00"
    E a segunda tela tenta salvar "34,00"
    Então a ação é recusada com o código "CONCURRENT_MODIFICATION"
    E o cardápio da loja "Centro" tem "X-Burger" por 3300 centavos
