# language: pt
Funcionalidade: Divisão de conta
  Para cada um pagar a sua parte
  Como caixa
  Quero dividir a conta por pessoas e por itens

  Contexto:
    Dado que "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existe a mesa "10" no "Centro"
    E "joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"
    E "bia" abriu o caixa com "100,00" de fundo de troco

  Cenário: Dividir por 3 pessoas
    Quando "bia" divide a conta da mesa "10" por 3 pessoas
    Então as partes são "26,04", "26,03" e "26,03"
    Quando "bia" recebe as 3 partes no PIX da mesa "10"
    Então a conta da mesa "10" está "FECHADO" com total "78,10"

  Cenário: Pagar só os próprios itens
    Quando "bia" recebe no PIX da mesa "10" só o "Refrigerante lata"
    Então o pagamento foi de "7,70"
    E o "Refrigerante lata" da mesa "10" está pago
    Quando "bia" tenta receber no PIX da mesa "10" só o "Refrigerante lata"
    Então a ação é recusada com o código "ITEM_ALREADY_PAID"
    Quando "bia" recebe "70,40" em dinheiro da mesa "10"
    Então a conta da mesa "10" está "FECHADO" com total "78,10"
