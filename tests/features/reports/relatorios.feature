# language: pt
Funcionalidade: Relatórios
  Para entender o período
  Como gerente
  Quero relatórios de vendas, caixa, estoque e operação no dia operacional da loja

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E o "X-Burger" usa "150" "g" de "Carne moída"
    E o "Centro" tem "1" "kg" de "Carne moída"
    E existe a mesa "10" no "Centro"
    E "bia" abriu o caixa com "0,00" de fundo de troco

  Cenário: Venda conta no dia operacional do fechamento
    Dado "joão" enviou 1 "X-Burger" para a mesa "10"
    E "bia" fechou o caixa informando "0,00" em dinheiro
    E o relógio passa para "2026-03-15" às "06:00"
    E "bia" abriu o caixa com "0,00" de fundo de troco
    E "bia" recebeu tudo no PIX da mesa "10"
    Quando "carla" vê o relatório de vendas de "2026-03-14" a "2026-03-15"
    Então o dia "2026-03-14" tem 0 contas e o dia "2026-03-15" tem 1 conta de "35,20"

  Cenário: Vendas por produto com custo e margem
    Dado "joão" enviou 2 "X-Burger" para a mesa "10"
    E "bia" recebeu tudo no PIX da mesa "10"
    Quando "carla" vê as vendas por produto de hoje
    Então "X-Burger" tem 2 unidades, valor "64,00", custo "12,00" e margem "52,00"

  Cenário: Vendas por forma de pagamento
    Dado "joão" enviou 2 "X-Burger" para a mesa "10"
    E "bia" recebeu "50,00" no PIX da mesa "10"
    E "bia" recebeu o restante em dinheiro da mesa "10"
    Quando "carla" vê o relatório de vendas de hoje
    Então as formas de pagamento são "PIX" "50,00" e "DINHEIRO" "20,40"

  Cenário: Relatório de caixa com a diferença do fechamento
    Dado "bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão
    E "bia" fechou o caixa informando "40,00" em dinheiro
    Quando "carla" vê o relatório de caixa de hoje
    Então o caixa "CX01" tem diferença em dinheiro "-5,50"

  Cenário: Estoque: CMV do período e insumo abaixo do mínimo
    Dado o mínimo de "Carne moída" no "Centro" é "900" "g"
    E "joão" enviou 1 "X-Burger" para a mesa "10"
    Quando "carla" vê o relatório de estoque de hoje
    Então o CMV do período é "6,00"
    E "Carne moída" aparece abaixo do mínimo
