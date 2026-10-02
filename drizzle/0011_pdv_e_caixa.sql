-- Etapa 8 — PDV e caixa (docs/modules/cashier.md, pos.md). Gerada pelo drizzle-kit e revisada:
-- índices ANTES das chaves estrangeiras (o MySQL reaproveita o índice e não cria um duplicado).

-- Caixa, movimentações, fechamento cego, pagamentos e divisão por itens
CREATE TABLE `cash_movement` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`cash_session_id` binary(16) NOT NULL,
	`type` enum('VENDA','SANGRIA','SUPRIMENTO','AJUSTE','ESTORNO') NOT NULL,
	`payment_method` enum('DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO','OUTRO') NOT NULL,
	`amount_cents` int NOT NULL,
	`payment_id` binary(16),
	`reason` varchar(200),
	`user_id` binary(16) NOT NULL,
	`authorized_by` binary(16),
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `cash_movement_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cash_movement_payment_type` UNIQUE(`payment_id`,`type`),
	CONSTRAINT `ck_cash_movement_amount` CHECK(`cash_movement`.`amount_cents` <> 0),
	CONSTRAINT `ck_cash_movement_kind` CHECK((`cash_movement`.`type` IN ('SANGRIA', 'SUPRIMENTO', 'AJUSTE') AND `cash_movement`.`payment_id` IS NULL AND `cash_movement`.`reason` IS NOT NULL AND `cash_movement`.`payment_method` = 'DINHEIRO') OR (`cash_movement`.`type` IN ('VENDA', 'ESTORNO') AND `cash_movement`.`payment_id` IS NOT NULL))
);--> statement-breakpoint
CREATE TABLE `cash_session` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`terminal_id` binary(16) NOT NULL,
	`status` enum('ABERTA','FECHADA') NOT NULL DEFAULT 'ABERTA',
	`operational_date` date NOT NULL,
	`opened_by` binary(16) NOT NULL,
	`opened_at` datetime(3) NOT NULL,
	`opening_amount_cents` int unsigned NOT NULL,
	`closed_by` binary(16),
	`closed_at` datetime(3),
	`version` int unsigned NOT NULL DEFAULT 0,
	`open_terminal_id` binary(16) GENERATED ALWAYS AS ((if(`status` = 'ABERTA', `terminal_id`, NULL))) STORED,
	CONSTRAINT `cash_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cash_session_open_terminal` UNIQUE(`open_terminal_id`),
	CONSTRAINT `ck_cash_session_opening` CHECK(`cash_session`.`opening_amount_cents` <= 10000000),
	CONSTRAINT `ck_cash_session_closed` CHECK((`cash_session`.`status` = 'FECHADA') = (`cash_session`.`closed_at` IS NOT NULL))
);--> statement-breakpoint
CREATE TABLE `cash_session_count` (
	`cash_session_id` binary(16) NOT NULL,
	`payment_method` enum('DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO','OUTRO') NOT NULL,
	`expected_cents` int NOT NULL,
	`declared_cents` int,
	`difference_cents` int,
	CONSTRAINT `cash_session_count_pk` PRIMARY KEY(`cash_session_id`,`payment_method`),
	CONSTRAINT `ck_cash_session_count_difference` CHECK((`cash_session_count`.`declared_cents` IS NULL AND `cash_session_count`.`difference_cents` IS NULL) OR `cash_session_count`.`difference_cents` = `cash_session_count`.`declared_cents` - `cash_session_count`.`expected_cents`)
);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`order_id` binary(16) NOT NULL,
	`cash_session_id` binary(16) NOT NULL,
	`method` enum('DINHEIRO','PIX','CARTAO_CREDITO','CARTAO_DEBITO','OUTRO') NOT NULL,
	`amount_cents` int unsigned NOT NULL,
	`tendered_cents` int unsigned,
	`change_cents` int unsigned,
	`reference` varchar(60),
	`status` enum('ATIVO','CANCELADO') NOT NULL DEFAULT 'ATIVO',
	`created_by` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`cancelled_by` binary(16),
	`cancelled_at` datetime(3),
	`cancel_authorized_by` binary(16),
	`cancel_reason` varchar(200),
	`version` int unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `payment_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_payment_amount` CHECK(`payment`.`amount_cents` > 0),
	CONSTRAINT `ck_payment_change` CHECK((`payment`.`method` = 'DINHEIRO' AND `payment`.`tendered_cents` = `payment`.`amount_cents` + `payment`.`change_cents`) OR (`payment`.`method` <> 'DINHEIRO' AND `payment`.`tendered_cents` IS NULL AND `payment`.`change_cents` IS NULL)),
	CONSTRAINT `ck_payment_cancel` CHECK((`payment`.`status` = 'CANCELADO') = (`payment`.`cancel_reason` IS NOT NULL))
);--> statement-breakpoint
CREATE TABLE `payment_allocation` (
	`payment_id` binary(16) NOT NULL,
	`order_item_id` binary(16) NOT NULL,
	`amount_cents` int unsigned NOT NULL,
	CONSTRAINT `payment_allocation_pk` PRIMARY KEY(`payment_id`,`order_item_id`)
);--> statement-breakpoint

-- Conta no PDV: taxa congelada, desconto, pago, pré-conta e valores do fechamento
ALTER TABLE `customer_order` ADD `service_fee_bp` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `service_fee_waived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `discount_cents` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `discount_reason` varchar(200);--> statement-breakpoint
ALTER TABLE `customer_order` ADD `paid_cents` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `prebill_at` datetime(3);--> statement-breakpoint
ALTER TABLE `customer_order` ADD `items_cents` int unsigned;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `discounts_cents` int unsigned;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `service_fee_cents` int unsigned;--> statement-breakpoint
ALTER TABLE `customer_order` ADD `total_cents` int unsigned;--> statement-breakpoint
ALTER TABLE `order_item` ADD `discount_cents` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_item` ADD `discount_reason` varchar(200);--> statement-breakpoint

-- Contas de MESA já abertas: a taxa é a da loja (RN-POS-03 — congelada na abertura); balcão = 0
UPDATE `customer_order` o JOIN `store` s ON s.`id` = o.`store_id`
  SET o.`service_fee_bp` = s.`service_fee_bp` WHERE o.`type` = 'MESA';--> statement-breakpoint

CREATE INDEX `ix_cash_movement_session_type` ON `cash_movement` (`cash_session_id`,`type`);--> statement-breakpoint
CREATE INDEX `ix_cash_movement_store` ON `cash_movement` (`store_id`);--> statement-breakpoint
CREATE INDEX `ix_cash_movement_user` ON `cash_movement` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_cash_movement_authorized_by` ON `cash_movement` (`authorized_by`);--> statement-breakpoint
CREATE INDEX `ix_cash_session_store_status` ON `cash_session` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_cash_session_store_date` ON `cash_session` (`store_id`,`operational_date`);--> statement-breakpoint
CREATE INDEX `ix_cash_session_terminal` ON `cash_session` (`terminal_id`);--> statement-breakpoint
CREATE INDEX `ix_cash_session_opened_by` ON `cash_session` (`opened_by`);--> statement-breakpoint
CREATE INDEX `ix_cash_session_closed_by` ON `cash_session` (`closed_by`);--> statement-breakpoint
CREATE INDEX `ix_payment_order_status` ON `payment` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_payment_store_created` ON `payment` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_payment_cash_session` ON `payment` (`cash_session_id`);--> statement-breakpoint
CREATE INDEX `ix_payment_created_by` ON `payment` (`created_by`);--> statement-breakpoint
CREATE INDEX `ix_payment_cancelled_by` ON `payment` (`cancelled_by`);--> statement-breakpoint
CREATE INDEX `ix_payment_cancel_authorized_by` ON `payment` (`cancel_authorized_by`);--> statement-breakpoint
CREATE INDEX `ix_payment_allocation_item` ON `payment_allocation` (`order_item_id`);--> statement-breakpoint

ALTER TABLE `cash_movement` ADD CONSTRAINT `cash_movement_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movement` ADD CONSTRAINT `cash_movement_cash_session_id_cash_session_id_fk` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_session`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movement` ADD CONSTRAINT `cash_movement_payment_id_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payment`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movement` ADD CONSTRAINT `cash_movement_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_movement` ADD CONSTRAINT `cash_movement_authorized_by_app_user_id_fk` FOREIGN KEY (`authorized_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_session` ADD CONSTRAINT `cash_session_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_session` ADD CONSTRAINT `cash_session_terminal_id_terminal_id_fk` FOREIGN KEY (`terminal_id`) REFERENCES `terminal`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_session` ADD CONSTRAINT `cash_session_opened_by_app_user_id_fk` FOREIGN KEY (`opened_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_session` ADD CONSTRAINT `cash_session_closed_by_app_user_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_session_count` ADD CONSTRAINT `cash_session_count_cash_session_id_cash_session_id_fk` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_session`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_order_id_customer_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `customer_order`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_cash_session_id_cash_session_id_fk` FOREIGN KEY (`cash_session_id`) REFERENCES `cash_session`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_created_by_app_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_cancelled_by_app_user_id_fk` FOREIGN KEY (`cancelled_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment` ADD CONSTRAINT `payment_cancel_authorized_by_app_user_id_fk` FOREIGN KEY (`cancel_authorized_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocation` ADD CONSTRAINT `payment_allocation_payment_id_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payment`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocation` ADD CONSTRAINT `payment_allocation_order_item_id_order_item_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_item`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE `customer_order` ADD CONSTRAINT `ck_customer_order_service_fee` CHECK (`customer_order`.`service_fee_bp` <= 10000);--> statement-breakpoint
ALTER TABLE `customer_order` ADD CONSTRAINT `ck_customer_order_discount` CHECK ((`customer_order`.`discount_cents` = 0) = (`customer_order`.`discount_reason` IS NULL));--> statement-breakpoint
ALTER TABLE `customer_order` ADD CONSTRAINT `ck_customer_order_closed_totals` CHECK (`customer_order`.`status` <> 'FECHADO' OR (`customer_order`.`total_cents` IS NOT NULL AND `customer_order`.`paid_cents` = `customer_order`.`total_cents`));--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `ck_order_item_discount` CHECK (`order_item`.`discount_cents` <= (`order_item`.`unit_price_cents` + `order_item`.`modifiers_cents`) * `order_item`.`quantity` AND (`order_item`.`discount_cents` = 0) = (`order_item`.`discount_reason` IS NULL));
