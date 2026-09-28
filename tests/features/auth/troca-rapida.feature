# language: pt
Funcionalidade: Troca rápida de garçom no aparelho compartilhado
  Para atender rápido sem digitar a senha toda hora
  Como garçom
  Quero trocar de usuário no tablet do salão usando meu PIN

  Cenário: Garçom troca de usuário com o PIN
    Dado que "joao" e "ana" já entraram com senha no tablet do salão
    E "joao" está usando o tablet do salão
    Quando "ana" escolhe seu nome e digita o PIN "482915"
    Então "ana" passa a usar o tablet do salão
    E a sessão de "joao" no tablet do salão foi encerrada

  Cenário: Quem nunca entrou com senha no aparelho não aparece na troca
    Dado que "joao" e "ana" já entraram com senha no tablet do salão
    Quando alguém abre a tela de troca em outro aparelho
    Então a lista de usuários do aparelho está vazia

  Cenário: Cinco PINs errados travam o PIN
    Dado que "joao" e "ana" já entraram com senha no tablet do salão
    Quando "ana" digita o PIN errado 5 vezes
    E "ana" escolhe seu nome e digita o PIN "482915"
    Então a troca é negada com a mensagem "PIN bloqueado após 5 tentativas. Entre com sua senha."
