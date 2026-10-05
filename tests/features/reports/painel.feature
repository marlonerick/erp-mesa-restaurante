# language: pt
Funcionalidade: Painel do dia
  Para acompanhar o movimento sem procurar em várias telas
  Como gerente ou caixa
  Quero ver na tela inicial as vendas, as mesas, a cozinha, os caixas e o estoque baixo do dia

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existem as mesas "10" e "11" no "Centro"
    E "bia" abriu o caixa com "100,00" de fundo de troco

  Cenário: Vendas do dia, ticket médio e mais vendidos
    Dado "joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"
    E "bia" recebeu tudo no PIX da mesa "10"
    E "joão" enviou 1 "X-Burger" para o balcão "Ana"
    E "bia" recebeu tudo em dinheiro do balcão "Ana"
    Quando "carla" abre o painel
    Então o painel mostra vendas "110,10", 2 contas fechadas e ticket médio "55,05"
    E o mais vendido é "X-Burger" com 3 unidades

  Cenário: Mesas, cozinha e itens atrasados
    Dado "joão" enviou 1 "X-Burger" para a mesa "11"
    E passaram 21 minutos
    Quando "carla" abre o painel
    Então o painel mostra 1 mesa ocupada, 1 item na cozinha e 1 item atrasado
    E o painel mostra 1 caixa aberto sem o valor esperado

  Cenário: O caixa vê o painel, mas não os relatórios
    Quando "bia" abre o painel
    Então o painel abre
    Quando "bia" tenta abrir o relatório de vendas
    Então a ação é recusada com o código "FORBIDDEN"

  Cenário: O garçom não vê o painel
    Quando "joão" tenta abrir o painel
    Então a ação é recusada com o código "FORBIDDEN"
