# language: pt
Funcionalidade: Troca de loja em 1 clique
  Para trabalhar em mais de uma loja sem sair do sistema
  Como pessoa com perfil em várias lojas
  Quero trocar a loja ativa com 1 clique

  Cenário: Gerente de uma loja e caixa de outra troca de loja
    Dado que "bia" é gerente na loja "Centro" e caixa na loja "Praia"
    E "bia" está trabalhando na loja "Centro"
    Quando "bia" troca para a loja "Praia"
    Então a sessão de "bia" passa a estar na loja "Praia"
    E "bia" não tem mais a permissão "users.read"
    E a auditoria registra o evento "STORE_SWITCHED" feito por "bia"

  Cenário: Não é possível trocar para uma loja sem perfil
    Dado que "carla" é gerente na loja "Centro"
    Quando "carla" tenta trocar para a loja "Praia"
    Então a ação é negada com a mensagem "Loja não encontrada."
    E a sessão de "carla" continua na loja "Centro"

  Cenário: Loja desativada leva a sessão para outra loja
    Dado que "bia" é gerente na loja "Centro" e caixa na loja "Praia"
    E "bia" está trabalhando na loja "Praia"
    Quando o administrador desativa a loja "Praia"
    Então na próxima requisição a sessão de "bia" está na loja "Centro"
