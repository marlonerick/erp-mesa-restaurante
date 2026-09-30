# language: pt
Funcionalidade: Enviar a rodada para a cozinha
  Para a cozinha preparar e o estoque baixar na hora certa (ADR-0006)
  Como garçom
  Quero enviar os itens lançados de uma vez

  Contexto:
    Dado que "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E o "X-Burger" usa "150" "g" de "Carne moída" e o "Bacon" usa "30" "g" de "Bacon fatiado"
    E o "Centro" tem "1" "kg" de "Carne moída" e "1" "kg" de "Bacon fatiado"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existe a mesa "10" no "Centro"
    E "joão" abriu a mesa "10"

  Cenário: Enviar a rodada manda o lanche para a cozinha e baixa o estoque
    Dado "joão" lançou 2 "X-Burger" com "Bacon" na mesa "10"
    Quando "joão" envia a rodada da mesa "10"
    Então a mesa "10" tem a rodada 1 com 1 item "ENVIADO"
    E a cozinha do "Centro" recebeu 1 ticket novo
    E o saldo de "Carne moída" no "Centro" é "700.000"
    E o saldo de "Bacon fatiado" no "Centro" é "940.000"
    E a auditoria registra "ORDER_ROUND_SENT" feito por "joão"

  Cenário: Bebida sem preparo não vai para a cozinha e já fica pronta
    Dado "joão" lançou 1 "Refrigerante lata" na mesa "10"
    Quando "joão" envia a rodada da mesa "10"
    Então a mesa "10" tem a rodada 1 com 1 item "PRONTO"
    E a cozinha do "Centro" recebeu 0 ticket novo

  Cenário: O garçom entrega a bebida pronta
    Dado "joão" lançou 1 "Refrigerante lata" na mesa "10"
    E "joão" enviou a rodada da mesa "10"
    Quando "joão" entrega o primeiro item da mesa "10"
    Então o primeiro item da mesa "10" está "ENTREGUE"

  Cenário: Reenviar com a mesma chave não duplica
    Dado "joão" lançou 1 "X-Burger" na mesa "10"
    Quando "joão" envia a rodada da mesa "10" com a chave "k1"
    E "joão" reenvia a rodada da mesa "10" com a chave "k1"
    Então a mesa "10" tem 1 rodada
    E o saldo de "Carne moída" no "Centro" é "850.000"

  Cenário: Item enviado por outro garçom enquanto a tela estava aberta
    Dado "joão" lançou 1 "X-Burger" na mesa "10"
    E outro garçom já enviou a rodada da mesa "10"
    Quando "joão" envia os itens que a tela dele mostrava
    Então a ação é recusada com o código "ITEMS_CHANGED"
    E a mesa "10" tem 1 rodada

  Cenário: Sem estoque e com política de bloquear, nada é enviado
    Dado a loja "Centro" bloqueia estoque negativo
    E "joão" lançou 7 "X-Burger" na mesa "10"
    Quando "joão" tenta enviar a rodada da mesa "10"
    Então a ação é recusada com o código "INSUFFICIENT_STOCK"
    E a conta da mesa "10" tem 1 item pendente
    E o saldo de "Carne moída" no "Centro" é "1000.000"

  Cenário: Sem estoque e com política de permitir, envia e avisa o garçom
    Dado "joão" lançou 7 "X-Burger" na mesa "10"
    Quando "joão" envia a rodada da mesa "10"
    Então o envio avisa que falta "Carne moída"
    E o saldo de "Carne moída" no "Centro" é "-50.000"
