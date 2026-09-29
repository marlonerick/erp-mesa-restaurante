# language: pt
Funcionalidade: Dia operacional
  Para que as vendas depois da meia-noite contem no dia certo
  Como dono do restaurante
  Quero que o dia de trabalho vire no horário configurado da loja

  Esquema do Cenário: Dia operacional com virada às 05:00 em São Paulo
    Dado uma loja no fuso "America/Sao_Paulo" com virada do dia às "05:00"
    Quando uma venda acontece às "<hora_local>" do dia "<data_local>" no horário da loja
    Então a venda pertence ao dia operacional "<dia_operacional>"

    Exemplos:
      | data_local | hora_local | dia_operacional |
      | 2026-03-14 | 23:59      | 2026-03-14      |
      | 2026-03-15 | 00:00      | 2026-03-14      |
      | 2026-03-15 | 04:59      | 2026-03-14      |
      | 2026-03-15 | 05:00      | 2026-03-15      |
      | 2026-01-01 | 02:00      | 2025-12-31      |
      | 2026-03-01 | 01:00      | 2026-02-28      |

  Cenário: O fuso da loja muda o dia operacional
    Dado uma loja no fuso "America/Manaus" com virada do dia às "05:00"
    Quando uma venda acontece às "08:30" UTC do dia "2026-03-15"
    Então a venda pertence ao dia operacional "2026-03-14"
