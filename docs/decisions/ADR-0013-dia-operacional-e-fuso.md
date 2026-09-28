# ADR-0013 — Dia operacional e fuso horário

- Status: **Aceito** em 2026-09-28 (horário de corte a confirmar — Q-05)
- Data: 2026-09-27
- Responsável: domain-spec + architect

## Contexto
Restaurante que fecha às 2h vende "de ontem" depois da meia-noite. O README liga o dia
operacional à sessão de caixa. Pode haver vendas com caixa aberto antes e depois da meia-noite,
e pode haver mais de um terminal.

## Decisão (proposta)
- Banco sempre em UTC; cada loja tem `timezone` IANA (padrão `America/Sao_Paulo`) e
  `operational_day_cutoff` (padrão `05:00`).
- **Dia operacional de um instante** = data local de `(instante no fuso da loja − cutoff)`.
  Ex.: 01:30 de 15/03 com cutoff 05:00 → dia operacional 14/03.
- Sessão de caixa grava `operational_date` **na abertura**. Pagamentos e receitas pertencem ao dia
  operacional da sessão de caixa em que foram registrados (vínculo pedido pelo README).
- Conta (`customer_order.operational_date`) recebe o dia operacional da sessão de caixa que a fechou.
- Movimentos de estoque e demais eventos usam a regra do cutoff.
- Dashboard mostra o dia operacional **corrente** (pela regra do cutoff).
- Funções puras em `shared/operational-day` com `Clock` injetável; testes cobrindo 23:59, 00:00,
  cutoff exato e mudança de regras de fuso.

## Consequências
- (+) Relatórios batem com o caixa físico.
- (−) Caixa aberto além do cutoff do dia seguinte ainda conta no dia da abertura — aviso na UI
  para fechar o caixa ("caixa aberto há mais de 1 dia operacional").
