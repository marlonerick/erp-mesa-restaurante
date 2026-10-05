# language: pt
Funcionalidade: Financeiro básico
  Para saber quanto entrou e quanto saiu
  Como dono do restaurante
  Quero que as vendas entrem sozinhas e poder lançar as despesas

  Contexto:
    Dado que "carla" é gerente na loja "Centro"
    E "bia" é caixa na loja "Centro" usando o terminal de caixa "CX01"

  Cenário: Fechar o caixa gera uma receita de vendas por forma de pagamento
    Dado "bia" abriu o caixa com "100,00" de fundo de troco
    E "bia" recebeu "45,50" em dinheiro e "30,00" no PIX de uma conta de balcão
    Quando "bia" fecha o caixa informando "145,50" em dinheiro
    Então o financeiro tem as receitas de vendas "45,50" em "DINHEIRO" e "30,00" em "PIX", pagas no dia do caixa
    E as receitas de vendas não podem ser canceladas

  Cenário: Despesa a pagar e depois paga
    Quando "carla" lança a despesa "Conta de luz" de "350,00" em "Contas de consumo" a pagar em "2026-03-20"
    Então o fluxo de caixa mostra "350,00" a pagar nos próximos dias
    Quando "carla" paga a despesa "Conta de luz" em "2026-03-14"
    Então o fluxo de caixa de "2026-03-14" tem entradas "0,00" e saídas "350,00"
    E a auditoria registra "FINANCE_ENTRY_PAID" feito por "carla"

  Cenário: Fluxo de caixa com saldo acumulado
    Dado "carla" lançou a receita "Evento fechado" de "1.000,00" em "Outras receitas" paga em "2026-03-13"
    E "carla" lançou a despesa "Gás" de "180,00" em "Contas de consumo" paga em "2026-03-14"
    Quando "carla" vê o fluxo de caixa de "2026-03-13" a "2026-03-14"
    Então o dia "2026-03-13" tem saldo "1.000,00" e acumulado "1.000,00"
    E o dia "2026-03-14" tem saldo "-180,00" e acumulado "820,00"

  Cenário: Cancelar despesa exige motivo
    Dado "carla" lançou a despesa "Gás" de "180,00" em "Contas de consumo" paga em "2026-03-14"
    Quando "carla" tenta cancelar a despesa "Gás" pelo motivo ""
    Então a ação é recusada com o código "CANCEL_REASON_REQUIRED"
    Quando "carla" cancela a despesa "Gás" pelo motivo "lançado em dobro"
    Então o fluxo de caixa de "2026-03-14" tem entradas "0,00" e saídas "0,00"

  Cenário: Categoria nova e categoria repetida
    Quando "carla" cria a categoria de despesa "Marketing"
    Então a categoria "Marketing" pode ser usada em despesas
    Quando "carla" tenta criar a categoria de despesa "marketing"
    Então a ação é recusada com o código "FINANCE_CATEGORY_TAKEN"

  Cenário: O caixa não vê o financeiro
    Quando "bia" tenta ver os lançamentos do financeiro
    Então a ação é recusada com o código "FORBIDDEN"
