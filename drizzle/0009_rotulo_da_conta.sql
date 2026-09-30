-- Etapa 6 — correção da revisão (achado I-1): o rótulo da conta guarda até 12 mesas juntadas
-- ("10 + 11 + …"; MAX_TABLES_PER_ORDER). Gerada pelo drizzle-kit e revisada.

ALTER TABLE `customer_order` MODIFY COLUMN `label` varchar(160) NOT NULL;
