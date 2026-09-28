# language: pt
Funcionalidade: Permissões por perfil e por loja
  Para que cada pessoa faça só o que é da sua função
  Como dono do restaurante
  Quero que o sistema confira as permissões no servidor

  Cenário: Garçom não pode cadastrar usuários
    Dado que "joao" é garçom na loja "Centro"
    Quando "joao" tenta cadastrar um usuário na loja "Centro"
    Então a ação é negada com a mensagem "Você não tem permissão para esta ação."

  Cenário: Perfil em uma loja não vale em outra
    Dado que "carla" é gerente na loja "Centro"
    Então "carla" pode cadastrar usuários na loja "Centro"
    Mas "carla" não pode cadastrar usuários na loja "Praia"

  Cenário: Perfil na organização vale em todas as lojas
    Dado que "dona" é administradora da organização
    Então "dona" pode cadastrar usuários na loja "Centro"
    E "dona" pode cadastrar usuários na loja "Praia"

  Cenário: Gerente não pode tornar alguém administrador
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" tenta dar o perfil ADMIN a um usuário na loja "Centro"
    Então a ação é negada com a mensagem "Você não pode atribuir este perfil."
