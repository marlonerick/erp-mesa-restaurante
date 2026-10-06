# language: pt
Funcionalidade: Caminho completo do piloto (golden path — README B.11)
  Para validar o MVP antes do piloto
  Como dono do restaurante
  Quero ver um dia inteiro funcionando pelas telas, do cadastro ao relatório, sem mexer no banco

  Cenário: Do cadastro da loja ao relatório do gerente
    Dado que o administrador cadastrou a loja do piloto com taxa de serviço de "10" %
    E cadastrou o terminal de caixa e a equipe: gerente, caixa, garçom e cozinha
    E cadastrou o insumo "Carne piloto" e lançou a compra de "1" kg por "40,00"
    E cadastrou o produto "X-Piloto" por "30,00" com ficha técnica de "200" g de "Carne piloto"
    E cadastrou a mesa do piloto
    Quando o caixa abre o caixa com "50,00" de fundo de troco
    E o garçom abre a mesa, lança 2 "X-Piloto" e envia para a cozinha
    E a cozinha marca o pedido como pronto
    E o garçom entrega os itens e pede a conta
    E o caixa emite a pré-conta de "66,00"
    E o caixa recebe "40,00" no PIX e "30,00" em dinheiro, com troco de "4,00"
    E o caixa fecha o caixa informando "76,00" em dinheiro e "40,00" no PIX
    Então o fechamento confere em dinheiro e no PIX
    E o estoque de "Carne piloto" baixou para "600 g"
    E o gerente vê no relatório vendas de "66,00" e no financeiro as receitas do caixa
