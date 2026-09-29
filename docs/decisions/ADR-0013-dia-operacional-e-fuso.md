# ADR-0013 — Dia operacional e fuso horário

- Status: **Aceito** em 2026-09-28; virada às 05:00 **confirmada** na Q-05 (2026-09-29), configurável por loja
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
- Funções puras em `shared/kernel/operational-day.ts` (`operationalDate`, `parseLocalTime`) —
  no kernel porque o domínio dos módulos (caixa, estoque) vai usá-las; o instante vem do `Clock`
  injetável. Testes: 23:59, 00:00, 04:59, 05:00, virada do ano, 29/02, outro fuso e propriedade
  (fast-check) — `tests/features/organizations/dia-operacional.feature`.

## Consequências
- (+) Relatórios batem com o caixa físico.
- (−) Caixa aberto além do cutoff do dia seguinte ainda conta no dia da abertura — aviso na UI
  para fechar o caixa ("caixa aberto há mais de 1 dia operacional").
