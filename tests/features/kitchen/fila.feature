# language: pt
Funcionalidade: Fila da cozinha
  Para preparar na ordem certa
  Como cozinheiro
  Quero ver os pedidos do mais antigo para o mais novo, com as observações em destaque

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "joão" é garçom na loja "Centro"
    E "rita" é da cozinha na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existem as mesas "10" e "11" no "Centro"

  Cenário: Pedidos aparecem na ordem de envio, sem os itens sem preparo
    Dado "joão" enviou 1 "X-Burger" com "Bacon" e a observação "sem cebola" para a mesa "11"
    E "joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"
    Quando "rita" abre a tela da cozinha
    Então a fila mostra "Mesa 11" e depois "Mesa 10"
    E o pedido da "Mesa 11" mostra "1 × X-Burger" com "Bacon" e a observação "sem cebola"
    E o pedido da "Mesa 10" mostra só "2 × X-Burger"
    E o pedido da "Mesa 10" foi enviado por "joão" na rodada 1

  Cenário: Pedido de balcão aparece com o nome do cliente
    Dado "joão" enviou 1 "X-Burger" para o balcão "Ana"
    Quando "rita" abre a tela da cozinha
    Então a fila mostra "Balcão · Ana"

  Cenário: Os tempos de alerta vêm da loja
    Dado o ADMIN configurou os alertas da cozinha do "Centro" para 8 e 15 minutos
    Quando "rita" abre a tela da cozinha
    Então a tela usa "Atenção" a partir de 8 minutos e "Atrasado" a partir de 15

  Cenário: Garçom acompanha, mas não marca
    Dado "joão" enviou 1 "X-Burger" para a mesa "10"
    Quando "joão" abre a tela da cozinha
    Então a fila mostra "Mesa 10"
    Quando "joão" tenta marcar pronto o primeiro item da mesa "10"
    Então a ação é recusada com o código "FORBIDDEN"

  Cenário: Pedido de outra loja não aparece
    Dado "paula" é da cozinha na loja "Praia"
    E "joão" enviou 1 "X-Burger" para a mesa "10"
    Quando "paula" abre a tela da cozinha
    Então a fila está vazia
    Quando "paula" tenta marcar pronto o primeiro item da mesa "10"
    Então a ação é recusada com o código "ORDER_ITEM_NOT_FOUND"
