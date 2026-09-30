# language: pt
Funcionalidade: Preparo na cozinha
  Para o garçom saber o que já pode levar à mesa
  Como cozinheiro
  Quero marcar cada item como iniciado e pronto, ou o pedido inteiro de uma vez

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "joão" é garçom na loja "Centro"
    E "rita" é da cozinha na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Batata frita" por "18,00"
    E existe a mesa "10" no "Centro"
    E "joão" enviou 1 "X-Burger" e 1 "Batata frita" para a mesa "10"

  Cenário: Iniciar e terminar um item
    Quando "rita" inicia o primeiro item da mesa "10"
    Então o primeiro item da mesa "10" está "EM_PREPARO"
    E o pedido da "Mesa 10" está "EM_PREPARO" na fila
    Quando "rita" marca pronto o primeiro item da mesa "10"
    Então o primeiro item da mesa "10" está "PRONTO"
    E o primeiro item da mesa "10" foi terminado por "rita"
    E o salão mostra 1 item pronto na mesa "10"
    E o pedido da "Mesa 10" continua na fila

  Cenário: Pronto sem ter iniciado
    Quando "rita" marca pronto o segundo item da mesa "10"
    Então o segundo item da mesa "10" está "PRONTO"
    E o pedido da "Mesa 10" está "EM_PREPARO" na fila

  Cenário: Tudo pronto tira o pedido da fila
    Quando "rita" marca tudo pronto no pedido da "Mesa 10"
    Então os itens enviados da mesa "10" estão "PRONTO"
    E a fila está vazia
    E "Mesa 10" aparece nos prontos há pouco

  Cenário: Marcar de novo não muda nada
    Dado "rita" marcou pronto o primeiro item da mesa "10"
    Quando "carla" marca pronto o primeiro item da mesa "10"
    Então nada mudou
    E o primeiro item da mesa "10" foi terminado por "rita"

  Cenário: Desfazer um pronto marcado por engano
    Dado "rita" marcou tudo pronto no pedido da "Mesa 10"
    Quando "rita" desfaz o pronto do primeiro item da mesa "10"
    Então o primeiro item da mesa "10" está "EM_PREPARO"
    E o pedido da "Mesa 10" está "EM_PREPARO" na fila
    E a auditoria registra "KITCHEN_READY_UNDONE" feito por "rita"

  Cenário: Depois de entregue, não dá para desfazer
    Dado "rita" marcou pronto o primeiro item da mesa "10"
    E "joão" entregou o primeiro item da mesa "10"
    Quando "rita" tenta desfazer o pronto do primeiro item da mesa "10"
    Então a ação é recusada com o código "ITEM_ALREADY_DELIVERED"

  Cenário: Item cancelado pelo salão não é marcado
    Dado "carla" cancelou o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Quando "rita" tenta marcar pronto o primeiro item da mesa "10"
    Então a ação é recusada com o código "ITEM_CANCELLED"
    E o pedido da "Mesa 10" mostra o primeiro item cancelado pelo motivo "cliente desistiu"

  Cenário: Cancelar o único item que faltava deixa o pedido pronto
    Dado "rita" marcou pronto o segundo item da mesa "10"
    Quando "carla" cancela o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Então a fila está vazia
    E "Mesa 10" aparece nos prontos há pouco

  Cenário: Pedido todo cancelado sai da fila riscado
    Quando "carla" cancela todos os itens da mesa "10" pelo motivo "cliente foi embora"
    Então a fila está vazia
    E o pedido da "Mesa 10" aparece riscado como cancelado
