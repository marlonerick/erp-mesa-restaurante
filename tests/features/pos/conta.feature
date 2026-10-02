# language: pt
Funcionalidade: Conta no PDV
  Para cobrar o valor certo
  Como caixa
  Quero ver itens, descontos e taxa de serviço e emitir a pré-conta

  Contexto:
    Dado que "carla" é gerente na loja "Centro" com o PIN "246810"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"
    E "joão" é garçom na loja "Centro"
    E a loja "Centro" vende "X-Burger" por "32,00" com o adicional "Bacon" de "5,00"
    E a loja "Centro" vende "Refrigerante lata" por "7,00" sem preparo
    E existe a mesa "10" no "Centro"
    E "joão" enviou 2 "X-Burger" e 1 "Refrigerante lata" para a mesa "10"

  Cenário: Taxa de serviço de 10% sobre os itens
    Quando "bia" abre a conta da mesa "10"
    Então a conta mostra itens "71,00", taxa de serviço "7,10" e total "78,10"

  Cenário: Taxa calculada depois do desconto
    Dado "bia" deu desconto de "5" por cento na conta da mesa "10" pelo motivo "cliente frequente"
    Quando "bia" abre a conta da mesa "10"
    Então a conta mostra desconto na conta "3,55", taxa de serviço "6,75" e total "74,20"

  Cenário: Balcão não tem taxa de serviço
    Dado "joão" enviou 1 "X-Burger" para o balcão "Ana"
    Quando "bia" abre a conta do balcão "Ana"
    Então a conta mostra itens "32,00", taxa de serviço "0,00" e total "32,00"

  Cenário: Desconto acima do limite do caixa pede o PIN do gerente
    Quando "bia" tenta dar desconto de "20" por cento na conta da mesa "10" pelo motivo "reclamação"
    Então a ação é recusada com o código "FORBIDDEN"
    Quando "carla" autoriza no aparelho de "bia" o desconto acima do limite com o PIN "246810"
    E "bia" dá desconto de "20" por cento na conta da mesa "10" pelo motivo "reclamação"
    Então a conta mostra desconto na conta "14,20"
    E a auditoria registra "DISCOUNT_APPLIED" feito por "bia" com autorização de "carla"

  Cenário: Desconto no item
    Quando "bia" dá desconto de "4,00" no primeiro item da mesa "10" pelo motivo "demorou"
    Então a conta mostra itens "71,00", desconto nos itens "4,00" e total "73,70"

  Cenário: Retirar a taxa de serviço exige o gerente
    Quando "carla" retira a taxa de serviço da mesa "10" pelo motivo "cliente reclamou"
    Então a conta mostra taxa de serviço "0,00" e total "71,00"
    E a auditoria registra "SERVICE_FEE_REMOVED" feito por "carla"

  Cenário: Pré-conta leva a mesa para pagamento
    Quando "bia" emite a pré-conta da mesa "10"
    Então a mesa "10" está "EM_PAGAMENTO"
    E a auditoria registra "PRE_BILL_ISSUED" feito por "bia"

  Cenário: Pré-conta com item não enviado é recusada
    Dado "joão" lançou 1 "X-Burger" na mesa "10"
    Quando "bia" tenta emitir a pré-conta da mesa "10"
    Então a ação é recusada com o código "PENDING_ITEMS"
