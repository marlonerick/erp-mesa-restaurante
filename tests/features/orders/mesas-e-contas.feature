# language: pt
Funcionalidade: Pedir a conta, transferir, juntar e separar mesas
  Para acompanhar o cliente que muda de lugar ou chega com mais gente
  Como garçom
  Quero mexer nas mesas sem perder nada da conta (Q-18)

  Contexto:
    Dado que "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E existem as mesas "10", "11" e "12" no "Centro"
    E "joão" abriu a mesa "10"
    E "joão" lançou 1 "X-Burger" na mesa "10"
    E "joão" enviou a rodada da mesa "10"

  Cenário: Pedir a conta
    Quando "joão" pede a conta da mesa "10"
    Então o mapa do "Centro" mostra a mesa "10" como "AGUARDANDO_CONTA"

  Cenário: Cliente pede mais depois de pedir a conta
    Dado "joão" pediu a conta da mesa "10"
    Quando "joão" lança 1 "X-Burger" na mesa "10"
    Então o mapa do "Centro" mostra a mesa "10" como "OCUPADA"
    E a auditoria registra "TABLE_STATUS_CHANGED" feito por "joão"

  Cenário: Não pede a conta com item pendente
    Dado "joão" lançou 1 "X-Burger" na mesa "10"
    Quando "joão" tenta pedir a conta da mesa "10"
    Então a ação é recusada com o código "PENDING_ITEMS"

  Cenário: Transferir a conta para outra mesa
    Quando "joão" transfere a mesa "10" para a mesa "11"
    Então o mapa do "Centro" mostra a mesa "10" como "LIVRE"
    E o mapa do "Centro" mostra a mesa "11" como "OCUPADA"
    E o subtotal da conta da mesa "11" é "32,00"
    E a auditoria registra "TABLE_TRANSFERRED" feito por "joão"

  Cenário: Juntar uma mesa livre
    Quando "joão" junta a mesa "11" na conta da mesa "10"
    Então a mesa "11" está na mesma conta da mesa "10"
    E o mapa do "Centro" mostra a mesa "11" como "OCUPADA"

  Cenário: Juntar duas contas abertas
    Dado "joão" abriu a mesa "12"
    E "joão" lançou 2 "X-Burger" na mesa "12"
    E "joão" enviou a rodada da mesa "12"
    Quando "joão" junta a mesa "12" na conta da mesa "10"
    Então a mesa "12" está na mesma conta da mesa "10"
    E o subtotal da conta da mesa "10" é "96,00"
    E a mesa "10" tem 2 rodadas
    E a conta antiga da mesa "12" foi encerrada como mesclada
    E a auditoria registra "ORDERS_MERGED" feito por "joão"

  Cenário: Separar uma mesa juntada por engano
    Dado "joão" juntou a mesa "11" na conta da mesa "10"
    Quando "joão" separa a mesa "11" da conta
    Então o mapa do "Centro" mostra a mesa "11" como "LIVRE"
    E o mapa do "Centro" mostra a mesa "10" como "OCUPADA"

  Cenário: Conta aberta por engano é cancelada se nada foi enviado
    Dado "joão" abriu a mesa "11"
    E "joão" lançou 1 "X-Burger" na mesa "11"
    Quando "joão" cancela a conta da mesa "11"
    Então o mapa do "Centro" mostra a mesa "11" como "LIVRE"
    E a auditoria registra "ORDER_CANCELLED" feito por "joão"

  Cenário: Conta com item enviado não é cancelada
    Quando "joão" tenta cancelar a conta da mesa "10"
    Então a ação é recusada com o código "ORDER_HAS_SENT_ITEMS"

  Cenário: Pedir a conta de mesas juntadas muda todas elas
    Dado "joão" juntou a mesa "11" na conta da mesa "10"
    Quando "joão" pede a conta da mesa "10"
    Então o mapa do "Centro" mostra a mesa "10" como "AGUARDANDO_CONTA"
    E o mapa do "Centro" mostra a mesa "11" como "AGUARDANDO_CONTA"

  Cenário: Cliente de mesas juntadas pede mais depois de pedir a conta
    Dado "joão" juntou a mesa "11" na conta da mesa "10"
    E "joão" pediu a conta da mesa "10"
    Quando "joão" lança 1 "X-Burger" na mesa "11"
    Então o mapa do "Centro" mostra a mesa "10" como "OCUPADA"
    E o mapa do "Centro" mostra a mesa "11" como "OCUPADA"

  Cenário: Juntar uma conta que já tem duas mesas
    Dado "joão" abriu a mesa "12"
    E "joão" juntou a mesa "11" na conta da mesa "12"
    Quando "joão" junta a mesa "12" na conta da mesa "10"
    Então a mesa "11" está na mesma conta da mesa "10"
    E a mesa "12" está na mesma conta da mesa "10"
    E o rótulo da conta da mesa "10" é "10 + 11 + 12"
