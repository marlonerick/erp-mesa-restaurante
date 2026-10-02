# language: pt
Funcionalidade: Pagamento
  Para receber sem erro e sem cobrar duas vezes
  Como caixa
  Quero registrar pagamentos, inclusive mistos, e fechar a conta quando estiver paga

  Contexto:
    Dado que "carla" é gerente na loja "Centro" com o PIN "246810"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existe a mesa "10" no "Centro"
    E "joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"

  Cenário: Pagamento misto com troco fecha a conta e libera a mesa para limpeza
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    Quando "bia" recebe "50,00" no PIX da mesa "10"
    E "bia" recebe "30,00" em dinheiro da mesa "10"
    Então o troco é "1,90"
    E a conta da mesa "10" está "FECHADO" com total "78,10"
    E a mesa "10" está "LIMPEZA"
    E o dinheiro esperado na gaveta é "128,10"
    E a auditoria registra "ORDER_CLOSED" feito por "bia"

  Cenário: Pagamento reenviado por perda de conexão não duplica
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "20,00" no PIX da mesa "10" com a chave "abc-123"
    Quando "bia" reenvia o pagamento de "20,00" no PIX da mesa "10" com a chave "abc-123"
    Então a mesa "10" tem 1 pagamento e falta pagar "58,10"

  Cenário: Sem caixa aberto não recebe
    Quando "bia" tenta receber "20,00" no PIX da mesa "10"
    Então a ação é recusada com o código "CASH_NOT_OPEN"

  Cenário: Cartão não pode passar do que falta
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    Quando "bia" tenta receber "100,00" no cartão de crédito da mesa "10"
    Então a ação é recusada com o código "PAYMENT_EXCEEDS_BALANCE"

  Cenário: Cancelar pagamento com PIN do gerente
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "20,00" em dinheiro da mesa "10"
    E "carla" autorizou no aparelho de "bia" o cancelamento de pagamento com o PIN "246810"
    Quando "bia" cancela o primeiro pagamento da mesa "10" pelo motivo "valor errado"
    Então a mesa "10" tem 0 pagamento e falta pagar "78,10"
    E o dinheiro esperado na gaveta é "100,00"
    E a auditoria registra "PAYMENT_CANCELLED" feito por "bia" com autorização de "carla"

  Cenário: Desconto depois do primeiro pagamento é recusado
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "20,00" em dinheiro da mesa "10"
    Quando "carla" tenta dar desconto de "10" por cento na conta da mesa "10" pelo motivo "cortesia"
    Então a ação é recusada com o código "PAYMENTS_STARTED"

  Cenário: Com pagamento na conta, a comanda não cancela item
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "20,00" em dinheiro da mesa "10"
    Quando "carla" tenta cancelar o primeiro item da mesa "10" pelo motivo "cliente desistiu"
    Então a ação é recusada com o código "PAYMENTS_STARTED"
