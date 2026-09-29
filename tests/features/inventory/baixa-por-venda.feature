# language: pt
Funcionalidade: Baixa de estoque pela venda (ADR-0006, opção A)
  Para o saldo refletir a cozinha durante o serviço
  Como dono do restaurante
  Quero que a venda baixe os insumos ao enviar o pedido e que cancelamentos sejam tratados

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E existe o insumo "Carne moída" em "g"
    E "carla" lançou a entrada de "1" "kg" de "Carne moída" pagando "40,00"

  Cenário: Enviar o item para a cozinha baixa o insumo
    Quando um item que usa "150" "g" de "Carne moída" é enviado para a cozinha
    Então o saldo de "Carne moída" no "Centro" é "850.000"
    E o CMV do dia no "Centro" é de 600 centavos

  Cenário: Cancelado antes do preparo volta ao estoque
    Dado um item que usa "150" "g" de "Carne moída" foi enviado para a cozinha
    Quando o item é cancelado antes do preparo
    Então o saldo de "Carne moída" no "Centro" é "1000.000"
    E o CMV do dia no "Centro" é de 0 centavos

  Cenário: Cancelado depois do preparo vira perda
    Dado um item que usa "150" "g" de "Carne moída" foi enviado para a cozinha
    Quando o item é cancelado depois do preparo
    Então o saldo de "Carne moída" no "Centro" é "850.000"
    E o CMV do dia no "Centro" é de 0 centavos
    E as perdas do dia no "Centro" somam 600 centavos

  Cenário: Sem estoque e com política de bloquear, o envio é recusado
    Dado a loja "Centro" bloqueia estoque negativo
    Quando um item que usa "1200" "g" de "Carne moída" tenta ser enviado para a cozinha
    Então a ação é recusada com o código "INSUFFICIENT_STOCK"
    E o saldo de "Carne moída" no "Centro" é "1000.000"

  Cenário: Sem estoque e com política de permitir, envia com alerta
    Quando um item que usa "1200" "g" de "Carne moída" é enviado para a cozinha
    Então o saldo de "Carne moída" no "Centro" é "-200.000"
    E o envio avisa que falta "Carne moída"
