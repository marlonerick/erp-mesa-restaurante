-- Fechamento do caixa (E10-6, opção C): primeira contagem do dinheiro quando o sistema pede recontagem
ALTER TABLE `cash_session` ADD `first_cash_count_cents` int unsigned;