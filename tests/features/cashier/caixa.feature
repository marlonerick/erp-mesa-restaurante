# language: pt
Funcionalidade: Caixa
  Para saber se o dinheiro do dia bate
  Como dono do restaurante
  Quero abrir o caixa com fundo de troco, registrar sangrias e suprimentos e fechar às cegas

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"

  Cenário: Abrir o caixa no terminal
    Quando "bia" abre o caixa com "150,00" de fundo de troco
    Então o caixa do terminal "CX01" está aberto com "150,00" de fundo
    E a auditoria registra "CASH_OPENED" feito por "bia"

  Cenário: Aparelho que não é terminal de caixa não abre caixa
    Dado "dani" é caixa na loja "Centro" sem terminal
    Quando "dani" tenta abrir o caixa com "100,00" de fundo de troco
    Então a ação é recusada com o código "TERMINAL_REQUIRED"

  Cenário: Um caixa aberto por terminal
    Dado "bia" abriu o caixa com "150,00" de fundo de troco
    Quando "bia" tenta abrir o caixa com "50,00" de fundo de troco
    Então a ação é recusada com o código "CASH_ALREADY_OPEN"

  Cenário: Sangria e suprimento com motivo
    Dado "bia" abriu o caixa com "150,00" de fundo de troco
    Quando "bia" faz um suprimento de "50,00" pelo motivo "troco extra"
    E "bia" faz uma sangria de "120,00" pelo motivo "depósito no cofre"
    Então o dinheiro esperado na gaveta é "80,00"

  Cenário: Sangria maior que o dinheiro da gaveta é aceita e aparece ao gerente no fechamento
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    Quando "bia" faz uma sangria de "150,00" pelo motivo "depósito"
    E "bia" fecha o caixa informando "0,00" em dinheiro e "0,00" no PIX
    Então a conferência aponta a sangria de "150,00" acima do esperado

  Cenário: Fechamento cego mostra a diferença
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão
    Quando "bia" fecha o caixa informando "140,00" em dinheiro e "30,00" no PIX
    Então o fechamento mostra em dinheiro esperado "145,50", informado "140,00" e diferença "-5,50"
    E o fechamento mostra no PIX esperado "30,00", informado "30,00" e diferença "0,00"
    E a auditoria registra "CASH_CLOSED" feito por "bia"

  Cenário: Dinheiro é obrigatório no fechamento
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    Quando "bia" tenta fechar o caixa sem informar o dinheiro
    Então a ação é recusada com o código "CASH_COUNT_REQUIRED"

  Cenário: Garçom não abre caixa
    Dado "joão" é garçom na loja "Centro" usando o terminal de caixa "CX02"
    Quando "joão" tenta abrir o caixa com "100,00" de fundo de troco
    Então a ação é recusada com o código "FORBIDDEN"
