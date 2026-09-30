# language: pt
Funcionalidade: Comanda eletrônica
  Para anotar o pedido na mesa sem papel
  Como garçom
  Quero abrir a conta e lançar itens com adicionais e observação

  Contexto:
    Dado que "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E existe a mesa "10" no "Centro"

  Cenário: Abrir a mesa ocupa a mesa e cria a conta número 1 do dia
    Quando "joão" abre a mesa "10" para 4 pessoas
    Então o mapa do "Centro" mostra a mesa "10" como "OCUPADA"
    E a conta da mesa "10" tem o número 1
    E a auditoria registra "ORDER_OPENED" feito por "joão"

  Cenário: Mesa ocupada não abre de novo
    Dado "joão" abriu a mesa "10"
    Quando "joão" tenta abrir a mesa "10"
    Então a ação é recusada com o código "TABLE_NOT_AVAILABLE"

  Cenário: Lançar item com adicional e observação
    Dado "joão" abriu a mesa "10"
    Quando "joão" lança 2 "X-Burger" com "Bacon" e a observação "sem cebola" na mesa "10"
    Então a conta da mesa "10" tem 1 item pendente
    E o subtotal da conta da mesa "10" é "74,00"

  Cenário: O preço fica congelado no lançamento
    Dado "joão" abriu a mesa "10"
    E "joão" lançou 1 "X-Burger" na mesa "10"
    Quando o preço do "X-Burger" no "Centro" muda para "40,00"
    Então o subtotal da conta da mesa "10" é "32,00"

  Cenário: Produto esgotado não pode ser lançado
    Dado "joão" abriu a mesa "10"
    E o "X-Burger" acabou no "Centro"
    Quando "joão" tenta lançar 1 "X-Burger" na mesa "10"
    Então a ação é recusada com o código "PRODUCT_NOT_AVAILABLE"

  Cenário: Remover item ainda não enviado
    Dado "joão" abriu a mesa "10"
    E "joão" lançou 1 "X-Burger" na mesa "10"
    Quando "joão" remove o primeiro item da mesa "10"
    Então a conta da mesa "10" tem 0 item pendente
    E o subtotal da conta da mesa "10" é "0,00"

  Cenário: Pedido de balcão com nome livre
    Quando "joão" abre uma conta de balcão para "Maria"
    E "joão" lança 1 "X-Burger" na conta de balcão "Maria"
    Então a lista de balcão do "Centro" mostra "Maria"
