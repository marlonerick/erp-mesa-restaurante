# language: pt
Funcionalidade: Cadastro de mesas da loja
  Para o garçom ver o salão no celular
  Como gerente
  Quero cadastrar as mesas de cada loja

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "joão" é garçom na loja "Centro"

  Cenário: Gerente cadastra uma mesa
    Quando "carla" cadastra a mesa "10" na área "Varanda" com 6 lugares
    Então o mapa do "Centro" mostra a mesa "10" como "LIVRE"
    E a auditoria registra "TABLE_CREATED" feito por "carla"

  Cenário: Número repetido na mesma loja é recusado
    Dado "carla" cadastrou a mesa "10"
    Quando "carla" tenta cadastrar a mesa "10"
    Então a ação é recusada com o código "TABLE_NUMBER_TAKEN"

  Cenário: Garçom não cadastra mesa
    Quando "joão" tenta cadastrar a mesa "20"
    Então a ação é recusada com o código "FORBIDDEN"

  Cenário: Mesa ocupada não pode ser desativada
    Dado "carla" cadastrou a mesa "10"
    E "joão" abriu a mesa "10"
    Quando "carla" tenta desativar a mesa "10"
    Então a ação é recusada com o código "TABLE_IN_USE"

  Cenário: Garçom libera a mesa depois da limpeza
    Dado "carla" cadastrou a mesa "10"
    E a mesa "10" está em "LIMPEZA"
    Quando "joão" libera a mesa "10"
    Então o mapa do "Centro" mostra a mesa "10" como "LIVRE"
