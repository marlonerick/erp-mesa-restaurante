# language: pt
Funcionalidade: Terminais da loja
  Para que o caixa e a cozinha saibam em qual aparelho estão
  Como gerente
  Quero registrar os aparelhos da loja como terminais

  Cenário: Gerente registra este aparelho como o Caixa 1
    Dado que "carla" é gerente na loja "Centro"
    E "carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"
    Quando "carla" usa este aparelho como o terminal "CX1"
    Então a sessão de "carla" passa a estar no terminal "CX1"
    E a auditoria registra o evento "TERMINAL_BOUND" feito por "carla"

  Cenário: Um aparelho é um terminal só
    Dado que "carla" é gerente na loja "Centro"
    E "carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"
    E "carla" cadastrou o terminal "CX2" "Caixa 2" do tipo "CAIXA"
    E este aparelho é o terminal "CX1"
    Quando "carla" usa este aparelho como o terminal "CX2"
    Então o terminal "CX1" fica sem aparelho
    E a sessão de "carla" passa a estar no terminal "CX2"

  Cenário: Terminal desativado deixa de valer na sessão
    Dado que "carla" é gerente na loja "Centro"
    E "carla" cadastrou o terminal "CX1" "Caixa 1" do tipo "CAIXA"
    E este aparelho é o terminal "CX1"
    Quando "carla" desativa o terminal "CX1"
    Então a sessão de "carla" fica sem terminal

  Cenário: Garçom não cadastra terminais
    Dado que "joao" é garçom na loja "Centro"
    Quando "joao" tenta cadastrar o terminal "CX9" "Caixa 9" do tipo "CAIXA"
    Então a ação é negada por falta de permissão
