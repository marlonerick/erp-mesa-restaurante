-- Etapa 9 — financeiro, painel e relatórios (docs/modules/finance.md, reports.md). Gerada pelo drizzle-kit e revisada:
-- índices ANTES das chaves estrangeiras (o MySQL reaproveita o índice e não cria um duplicado).

-- Categorias e lançamentos do financeiro
CREATE TABLE `finance_category` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`type` enum('RECEITA','DESPESA') NOT NULL,
	`name` varchar(60) NOT NULL,
	`system_code` varchar(20),
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `finance_category_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_finance_category_name` UNIQUE(`company_id`,`type`,`name`),
	CONSTRAINT `uq_finance_category_system` UNIQUE(`company_id`,`system_code`)
);--> statement-breakpoint
CREATE TABLE `finance_entry` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`type` enum('RECEITA','DESPESA') NOT NULL,
	`category_id` binary(16) NOT NULL,
	`description` varchar(120) NOT NULL,
	`amount_cents` int unsigned NOT NULL,
	`competence_date` date NOT NULL,
	`due_date` date,
	`paid_date` date,
	`status` enum('PREVISTO','PAGO','CANCELADO') NOT NULL,
	`source` enum('MANUAL','CAIXA') NOT NULL,
	`cash_session_id` binary(16),
	`payment_method` enum('DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO','OUTRO'),
	`created_by` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`cancelled_by` binary(16),
	`cancelled_at` datetime(3),
	`cancel_reason` varchar(200),
	`version` int unsigned NOT NULL DEFAULT 0,
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `finance_entry_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_finance_entry_cash_method` UNIQUE(`cash_session_id`,`payment_method`),
	CONSTRAINT `ck_finance_entry_amount` CHECK(`finance_entry`.`amount_cents` > 0),
	CONSTRAINT `ck_finance_entry_status` CHECK((`finance_entry`.`status` = 'PAGO' AND `finance_entry`.`paid_date` IS NOT NULL) OR (`finance_entry`.`status` = 'PREVISTO' AND `finance_entry`.`due_date` IS NOT NULL AND `finance_entry`.`paid_date` IS NULL) OR `finance_entry`.`status` = 'CANCELADO'),
	CONSTRAINT `ck_finance_entry_cancel` CHECK((`finance_entry`.`status` = 'CANCELADO') = (`finance_entry`.`cancel_reason` IS NOT NULL)),
	CONSTRAINT `ck_finance_entry_source` CHECK((`finance_entry`.`source` = 'CAIXA') = (`finance_entry`.`cash_session_id` IS NOT NULL AND `finance_entry`.`payment_method` IS NOT NULL))
);--> statement-breakpoint

-- Dia operacional do fechamento da conta (E9-1)
ALTER TABLE `customer_order` ADD `closed_date` date;--> statement-breakpoint

-- Contas já fechadas (Etapa 8): o dia do caixa do último pagamento; sem pagamento (cortesia), o dia
-- da abertura
UPDATE `customer_order` o SET o.`closed_date` = COALESCE((
  SELECT cs.`operational_date` FROM `payment` p JOIN `cash_session` cs ON cs.`id` = p.`cash_session_id`
  WHERE p.`order_id` = o.`id` AND p.`status` = 'ATIVO' ORDER BY p.`id` DESC LIMIT 1
), o.`opened_date`) WHERE o.`status` = 'FECHADO';--> statement-breakpoint

CREATE INDEX `ix_finance_entry_competence` ON `finance_entry` (`store_id`,`competence_date`);--> statement-breakpoint
CREATE INDEX `ix_finance_entry_due` ON `finance_entry` (`store_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `ix_finance_entry_paid` ON `finance_entry` (`store_id`,`paid_date`);--> statement-breakpoint
CREATE INDEX `ix_finance_entry_category` ON `finance_entry` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_finance_entry_created_by` ON `finance_entry` (`created_by`);--> statement-breakpoint
CREATE INDEX `ix_finance_entry_cancelled_by` ON `finance_entry` (`cancelled_by`);--> statement-breakpoint
CREATE INDEX `ix_customer_order_closed` ON `customer_order` (`store_id`,`status`,`closed_date`);--> statement-breakpoint
CREATE INDEX `ix_customer_order_opened` ON `customer_order` (`store_id`,`opened_date`);--> statement-breakpoint

ALTER TABLE `finance_category` ADD CONSTRAINT `finance_category_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_entry` ADD CONSTRAINT `finance_entry_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_entry` ADD CONSTRAINT `finance_entry_category_id_finance_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `finance_category`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_entry` ADD CONSTRAINT `finance_entry_cash_session_id_cash_session_id_fk` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_session`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_entry` ADD CONSTRAINT `finance_entry_created_by_app_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_entry` ADD CONSTRAINT `finance_entry_cancelled_by_app_user_id_fk` FOREIGN KEY (`cancelled_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;
