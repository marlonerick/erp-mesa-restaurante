# language: pt
Funcionalidade: Entrar no sistema
  Para que só a equipe do restaurante use o sistema
  Como funcionário
  Quero entrar com meu usuário e minha senha

  Cenário: Garçom entra com a senha correta
    Dado que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"
    Quando "joao" entra com a senha "Mesa@2026"
    Então o acesso é liberado na loja "Centro"
    E a auditoria registra o evento "LOGIN" para "joao"

  Cenário: Senha errada é recusada sem revelar o motivo
    Dado que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"
    Quando "joao" entra com a senha "errada123"
    Então o acesso é negado com a mensagem "Usuário ou senha inválidos."
    E a auditoria registra o evento "LOGIN_FAILED" para "joao"

  Cenário: Usuário inexistente recebe a mesma resposta
    Quando "ninguem" entra com a senha "Mesa@2026"
    Então o acesso é negado com a mensagem "Usuário ou senha inválidos."

  Cenário: Cinco senhas erradas bloqueiam novas tentativas
    Dado que o garçom "joao" tem a senha "Mesa@2026" na loja "Centro"
    E "joao" errou a senha 5 vezes
    Quando "joao" entra com a senha "Mesa@2026"
    Então o acesso é negado com a mensagem "Muitas tentativas. Aguarde alguns minutos e tente de novo."

  Cenário: Senha provisória obriga a troca
    Dado que o garçom "joao" tem a senha provisória "Provisoria1" na loja "Centro"
    Quando "joao" entra com a senha "Provisoria1"
    Então o acesso é liberado mas exige trocar a senha
