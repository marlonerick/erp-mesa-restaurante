# language: pt
Funcionalidade: Cadastro de usuários
  Para controlar quem trabalha no sistema
  Como gerente
  Quero cadastrar, alterar e desativar usuários da minha loja

  Cenário: Gerente cadastra um garçom com senha provisória
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" cadastra o garçom "Pedro Lima" com o usuário "pedro" e a senha provisória "Inicio2026"
    Então "pedro" consegue entrar com a senha "Inicio2026" mas precisa trocá-la
    E a auditoria registra o evento "USER_CREATED" feito por "carla"

  Cenário: Nome de usuário repetido é recusado
    Dado que "carla" é gerente na loja "Centro"
    E já existe o usuário "pedro"
    Quando "carla" cadastra o garçom "Outro Pedro" com o usuário "Pedro" e a senha provisória "Inicio2026"
    Então a ação é negada com a mensagem "Este nome de usuário já está em uso."

  Cenário: Gerente não vê usuários de outra loja
    Dado que "carla" é gerente na loja "Centro"
    E "rui" é garçom somente na loja "Praia"
    Quando "carla" lista os usuários da loja "Centro"
    Então "rui" não aparece na lista
