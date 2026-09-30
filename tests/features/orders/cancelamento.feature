# language: pt
Funcionalidade: Cancelar item já enviado para a cozinha
  Para não perder o controle do que saiu da cozinha
  Como dono do restaurante
  Quero que o cancelamento tenha motivo, autorização e o estoque certo

  Contexto:
    Dado que "carla" é gerente na loja "Centro" com o PIN "246810"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E o "X-Burger" usa "150" "g" de "Carne moída" e o "Bacon" usa "30" "g" de "Bacon fatiado"
    E o "Centro" tem "1" "kg" de "Carne moída" e "1" "kg" de "Bacon fatiado"
    E existe a mesa "10" no "Centro"
    E "joão" abriu a mesa "10"
    E "joão" lançou 1 "X-Burger" na mesa "10"
    E "joão" enviou a rodada da mesa "10"

  Cenário: Garçom sem autorização não cancela
    Quando "joão" tenta cancelar o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Então a ação é recusada com o código "FORBIDDEN"

  Cenário: Gerente autoriza com PIN e o insumo volta ao estoque
    Dado "carla" autorizou no aparelho de "joão" o cancelamento com o PIN "246810"
    Quando "joão" cancela o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Então o primeiro item da mesa "10" está "CANCELADO"
    E o saldo de "Carne moída" no "Centro" é "1000.000"
    E o subtotal da conta da mesa "10" é "0,00"
    E a auditoria registra "ORDER_ITEM_CANCELLED" feito por "joão" com autorização de "carla"

  Cenário: A autorização vale uma vez só
    Dado "carla" autorizou no aparelho de "joão" o cancelamento com o PIN "246810"
    E "joão" lançou 1 "X-Burger" na mesa "10"
    E "joão" enviou a rodada da mesa "10"
    E "joão" cancelou o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Quando "joão" tenta cancelar o segundo item da mesa "10" pelo motivo "cliente desistiu"
    Então a ação é recusada com o código "ELEVATED_GRANT_INVALID"

  Cenário: Motivo é obrigatório
    Quando "carla" tenta cancelar o primeiro item da mesa "10" pelo motivo ""
    Então a ação é recusada com o código "CANCEL_REASON_REQUIRED"

  Cenário: Cancelado depois do preparo vira perda
    Dado a cozinha começou a preparar o primeiro item da mesa "10"
    Quando "carla" cancela o primeiro item da mesa "10" pelo motivo "caiu no chão"
    Então o saldo de "Carne moída" no "Centro" é "850.000"
    E as perdas do dia no "Centro" somam 600 centavos
