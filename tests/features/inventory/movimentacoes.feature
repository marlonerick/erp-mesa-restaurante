# language: pt
Funcionalidade: Movimentações de estoque
  Para saber quanto tenho de cada insumo e quanto ele custa
  Como gerente
  Quero lançar compras, saídas, perdas e contagens

  Cenário: Compra em quilos vira gramas e define o custo médio
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Carne moída" em "g"
    Quando "carla" lança a entrada de "2" "kg" de "Carne moída" pagando "80,00"
    Então o saldo de "Carne moída" no "Centro" é "2000.000" com custo médio "0.040000"
    E a auditoria registra o evento "STOCK_ENTRY" feito por "carla"

  Cenário: Segunda compra recalcula o custo médio
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Carne moída" em "g"
    E "carla" lançou a entrada de "2" "kg" de "Carne moída" pagando "80,00"
    Quando "carla" lança a entrada de "1" "kg" de "Carne moída" pagando "46,00"
    Então o saldo de "Carne moída" no "Centro" é "3000.000" com custo médio "0.042000"

  Cenário: Contagem grava só a diferença
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Pão de hambúrguer" em "un"
    E "carla" lançou a entrada de "50" "un" de "Pão de hambúrguer" pagando "40,00"
    Quando "carla" informa a contagem de "47" "un" de "Pão de hambúrguer"
    Então o saldo de "Pão de hambúrguer" no "Centro" é "47.000"
    E o extrato de "Pão de hambúrguer" termina com um "AJUSTE" de "-3.000"

  Cenário: Perda com política de bloquear não deixa o saldo negativo
    Dado que "carla" é gerente na loja "Centro"
    E a loja "Centro" bloqueia estoque negativo
    E existe o insumo "Queijo" em "g"
    E "carla" lançou a entrada de "500" "g" de "Queijo" pagando "25,00"
    Quando "carla" tenta lançar a perda de "600" "g" de "Queijo" por "ESTRAGADO"
    Então a ação é recusada com o código "INSUFFICIENT_STOCK"
    E o saldo de "Queijo" no "Centro" é "500.000"

  Cenário: Alerta de estoque mínimo
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Queijo" em "g"
    E o mínimo de "Queijo" no "Centro" é "1000"
    Quando "carla" lança a entrada de "800" "g" de "Queijo" pagando "40,00"
    Então "Queijo" aparece abaixo do mínimo com saldo "800.000" e mínimo "1000.000"

  Cenário: Cozinha vê o estoque mas não lança
    Dado que "teo" é da cozinha na loja "Centro"
    E existe o insumo "Queijo" em "g"
    Quando "teo" tenta lançar a entrada de "1" "kg" de "Queijo" pagando "50,00"
    Então a ação é negada por falta de permissão
