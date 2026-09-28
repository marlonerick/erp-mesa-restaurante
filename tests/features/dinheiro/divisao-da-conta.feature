# language: pt
Funcionalidade: Divisão da conta em partes iguais
  Para que cada cliente pague a sua parte sem sobrar nem faltar centavo
  Como caixa
  Quero dividir o total da conta entre as pessoas da mesa

  Cenário: Conta de R$ 100,00 dividida entre 3 pessoas
    Dado uma conta de R$ 100,00
    Quando a conta é dividida entre 3 pessoas
    Então as partes são R$ 33,34, R$ 33,33 e R$ 33,33
    E a soma das partes é R$ 100,00

  Cenário: Taxa de serviço de 10% sobre a conta
    Dado uma conta de R$ 87,45
    Quando aplico a taxa de serviço de 10%
    Então a taxa de serviço é R$ 8,75
