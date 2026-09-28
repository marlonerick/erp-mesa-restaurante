# language: pt
Funcionalidade: Duração da sessão
  Para proteger o sistema quando alguém esquece de sair
  Como gerente
  Quero que as sessões terminem sozinhas

  Cenário: Sessão termina após 12 horas sem uso
    Dado que "joao" entrou às 18:00 em um aparelho individual
    Quando "joao" tenta usar o sistema às 06:01 do dia seguinte
    Então a sessão está encerrada

  Cenário: Sessão termina 7 dias após o login mesmo com uso contínuo
    Dado que "joao" entrou às 18:00 em um aparelho individual
    E "joao" usou o sistema a cada 6 horas durante 7 dias
    Quando "joao" tenta usar o sistema 7 dias e 1 minuto após o login
    Então a sessão está encerrada

  Cenário: Aparelho compartilhado encerra a sessão após 3 minutos sem uso
    Dado que "joao" entrou às 18:00 em um aparelho compartilhado
    Quando "joao" tenta usar o sistema às 18:04
    Então a sessão está encerrada

  Cenário: Desativar o usuário encerra a sessão dele
    Dado que "joao" entrou às 18:00 em um aparelho individual
    Quando o gerente desativa "joao"
    Então a sessão está encerrada
