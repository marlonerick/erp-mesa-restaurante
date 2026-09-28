# language: pt
Funcionalidade: Autorização do gerente no aparelho
  Para liberar uma ação sensível sem trocar de usuário
  Como caixa
  Quero que o gerente digite o PIN dele no meu aparelho

  Cenário: Gerente autoriza com o PIN uma ação que o caixa não pode fazer
    Dado que "bia" é caixa e "carla" é gerente na loja "Centro"
    Quando "carla" autoriza com o PIN "739104" a permissão "orders.cancel" para "bia"
    Então "bia" consegue executar a ação protegida por "orders.cancel"
    E a auditoria registra que "carla" autorizou "bia"

  Cenário: A autorização vale uma única vez
    Dado que "bia" é caixa e "carla" é gerente na loja "Centro"
    Quando "carla" autoriza com o PIN "739104" a permissão "orders.cancel" para "bia"
    E "bia" executa a ação protegida por "orders.cancel"
    Então "bia" não consegue repetir a ação com a mesma autorização

  Cenário: A autorização expira em 60 segundos
    Dado que "bia" é caixa e "carla" é gerente na loja "Centro"
    Quando "carla" autoriza com o PIN "739104" a permissão "orders.cancel" para "bia"
    E passam 61 segundos
    Então "bia" não consegue repetir a ação com a mesma autorização

  Cenário: Outro caixa não pode autorizar
    Dado que "bia" é caixa e "carla" é gerente na loja "Centro"
    Quando o caixa "davi" tenta autorizar com o PIN "551208" a permissão "orders.cancel" para "bia"
    Então a ação é negada com a mensagem "Este usuário não pode autorizar esta ação."
