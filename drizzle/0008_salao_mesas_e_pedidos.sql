-- Etapa 6 — salão, mesas e pedidos (docs/modules/tables.md §9, orders.md §9).
-- Gerada pelo drizzle-kit e REVISADA: índices criados ANTES das chaves estrangeiras (sem índices com
-- nome automático); permissão nova tables.configure (E6-2) escrita à mão.

CREATE TABLE `customer_order` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`number` int unsigned NOT NULL,
	`opened_date` date NOT NULL,
	`type` enum('MESA','BALCAO') NOT NULL,
	`status` enum('ABERTO','FECHADO','CANCELADO') NOT NULL DEFAULT 'ABERTO',
	`label` varchar(60) NOT NULL,
	`guests` tinyint unsigned,
	`opened_by` binary(16) NOT NULL,
	`opened_at` datetime(3) NOT NULL,
	`closed_by` binary(16),
	`closed_at` datetime(3),
	`cancel_reason` varchar(200),
	`merged_into_order_id` binary(16),
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `customer_order_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_customer_order_day_number` UNIQUE(`store_id`,`opened_date`,`number`),
	CONSTRAINT `ck_customer_order_guests` CHECK(`customer_order`.`guests` IS NULL OR `customer_order`.`guests` BETWEEN 1 AND 99),
	CONSTRAINT `ck_customer_order_merged` CHECK(`customer_order`.`merged_into_order_id` IS NULL OR `customer_order`.`status` = 'CANCELADO')
);--> statement-breakpoint
CREATE TABLE `dining_table` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`number` varchar(10) NOT NULL,
	`area` varchar(40),
	`seats` tinyint unsigned NOT NULL DEFAULT 4,
	`status` enum('LIVRE','OCUPADA','AGUARDANDO_CONTA','EM_PAGAMENTO','LIMPEZA') NOT NULL DEFAULT 'LIVRE',
	`current_order_id` binary(16),
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `dining_table_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_dining_table_store_number` UNIQUE(`store_id`,`number`),
	CONSTRAINT `ck_dining_table_seats` CHECK(`dining_table`.`seats` BETWEEN 1 AND 99),
	CONSTRAINT `ck_dining_table_order` CHECK((`dining_table`.`current_order_id` IS NULL) = (`dining_table`.`status` IN ('LIVRE', 'LIMPEZA')))
);--> statement-breakpoint
CREATE TABLE `kitchen_ticket` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`order_id` binary(16) NOT NULL,
	`round_id` binary(16) NOT NULL,
	`station_id` binary(16) NOT NULL,
	`status` enum('NOVO','EM_PREPARO','PRONTO','CANCELADO') NOT NULL DEFAULT 'NOVO',
	`created_at` datetime(3) NOT NULL,
	`started_at` datetime(3),
	`ready_at` datetime(3),
	`version` int unsigned NOT NULL DEFAULT 0,
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `kitchen_ticket_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_kitchen_ticket_round_station` UNIQUE(`round_id`,`station_id`)
);--> statement-breakpoint
CREATE TABLE `order_item` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`order_id` binary(16) NOT NULL,
	`round_id` binary(16),
	`product_id` binary(16) NOT NULL,
	`product_name` varchar(80) NOT NULL,
	`unit_price_cents` int unsigned NOT NULL,
	`modifiers_cents` int unsigned NOT NULL DEFAULT 0,
	`quantity` tinyint unsigned NOT NULL,
	`notes` varchar(140),
	`requires_preparation` boolean NOT NULL,
	`status` enum('PENDENTE','ENVIADO','EM_PREPARO','PRONTO','ENTREGUE','CANCELADO') NOT NULL DEFAULT 'PENDENTE',
	`station_id` binary(16),
	`kitchen_ticket_id` binary(16),
	`created_by` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`sent_at` datetime(3),
	`started_at` datetime(3),
	`ready_at` datetime(3),
	`delivered_at` datetime(3),
	`delivered_by` binary(16),
	`cancelled_at` datetime(3),
	`cancelled_by` binary(16),
	`cancel_authorized_by` binary(16),
	`cancel_reason` varchar(200),
	`stock_consumed` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `order_item_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_order_item_quantity` CHECK(`order_item`.`quantity` BETWEEN 1 AND 99),
	CONSTRAINT `ck_order_item_round` CHECK((`order_item`.`round_id` IS NULL) = (`order_item`.`status` = 'PENDENTE')),
	CONSTRAINT `ck_order_item_cancel` CHECK((`order_item`.`status` = 'CANCELADO') = (`order_item`.`cancel_reason` IS NOT NULL))
);--> statement-breakpoint
CREATE TABLE `order_item_modifier` (
	`id` binary(16) NOT NULL,
	`order_item_id` binary(16) NOT NULL,
	`modifier_id` binary(16) NOT NULL,
	`name` varchar(60) NOT NULL,
	`price_delta_cents` int unsigned NOT NULL,
	CONSTRAINT `order_item_modifier_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_item_modifier` UNIQUE(`order_item_id`,`modifier_id`)
);--> statement-breakpoint
CREATE TABLE `order_round` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`order_id` binary(16) NOT NULL,
	`number` smallint unsigned NOT NULL,
	`sent_by` binary(16) NOT NULL,
	`sent_at` datetime(3) NOT NULL,
	CONSTRAINT `order_round_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_order_round_number` UNIQUE(`order_id`,`number`)
);--> statement-breakpoint
CREATE TABLE `store_sequence` (
	`store_id` binary(16) NOT NULL,
	`name` varchar(30) NOT NULL,
	`operational_date` date NOT NULL,
	`last_value` int unsigned NOT NULL,
	CONSTRAINT `store_sequence_pk` PRIMARY KEY(`store_id`,`name`,`operational_date`)
);--> statement-breakpoint
CREATE INDEX `ix_customer_order_store_status` ON `customer_order` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_customer_order_opened_by` ON `customer_order` (`opened_by`);--> statement-breakpoint
CREATE INDEX `ix_customer_order_closed_by` ON `customer_order` (`closed_by`);--> statement-breakpoint
CREATE INDEX `ix_dining_table_store_status` ON `dining_table` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_dining_table_current_order` ON `dining_table` (`current_order_id`);--> statement-breakpoint
CREATE INDEX `ix_kitchen_ticket_queue` ON `kitchen_ticket` (`store_id`,`station_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_kitchen_ticket_order` ON `kitchen_ticket` (`order_id`);--> statement-breakpoint
CREATE INDEX `ix_kitchen_ticket_station` ON `kitchen_ticket` (`station_id`);--> statement-breakpoint
CREATE INDEX `ix_order_item_order_status` ON `order_item` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_order_item_store_status_sent` ON `order_item` (`store_id`,`status`,`sent_at`);--> statement-breakpoint
CREATE INDEX `ix_order_item_ticket` ON `order_item` (`kitchen_ticket_id`);--> statement-breakpoint
CREATE INDEX `ix_order_item_round` ON `order_item` (`round_id`);--> statement-breakpoint
CREATE INDEX `ix_order_item_product` ON `order_item` (`product_id`);--> statement-breakpoint
CREATE INDEX `ix_order_item_station` ON `order_item` (`station_id`);--> statement-breakpoint
CREATE INDEX `ix_order_item_created_by` ON `order_item` (`created_by`);--> statement-breakpoint
CREATE INDEX `ix_order_item_delivered_by` ON `order_item` (`delivered_by`);--> statement-breakpoint
CREATE INDEX `ix_order_item_cancelled_by` ON `order_item` (`cancelled_by`);--> statement-breakpoint
CREATE INDEX `ix_order_item_cancel_authorized_by` ON `order_item` (`cancel_authorized_by`);--> statement-breakpoint
CREATE INDEX `ix_order_item_modifier_modifier` ON `order_item_modifier` (`modifier_id`);--> statement-breakpoint
CREATE INDEX `ix_order_round_store` ON `order_round` (`store_id`);--> statement-breakpoint
CREATE INDEX `ix_order_round_sent_by` ON `order_round` (`sent_by`);--> statement-breakpoint
ALTER TABLE `customer_order` ADD CONSTRAINT `customer_order_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_order` ADD CONSTRAINT `customer_order_opened_by_app_user_id_fk` FOREIGN KEY (`opened_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_order` ADD CONSTRAINT `customer_order_closed_by_app_user_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dining_table` ADD CONSTRAINT `dining_table_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dining_table` ADD CONSTRAINT `dining_table_current_order_id_customer_order_id_fk` FOREIGN KEY (`current_order_id`) REFERENCES `customer_order`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_ticket` ADD CONSTRAINT `kitchen_ticket_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_ticket` ADD CONSTRAINT `kitchen_ticket_order_id_customer_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `customer_order`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_ticket` ADD CONSTRAINT `kitchen_ticket_round_id_order_round_id_fk` FOREIGN KEY (`round_id`) REFERENCES `order_round`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_ticket` ADD CONSTRAINT `kitchen_ticket_station_id_kitchen_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `kitchen_station`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_order_id_customer_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `customer_order`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_round_id_order_round_id_fk` FOREIGN KEY (`round_id`) REFERENCES `order_round`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_product_id_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_station_id_kitchen_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `kitchen_station`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_kitchen_ticket_id_kitchen_ticket_id_fk` FOREIGN KEY (`kitchen_ticket_id`) REFERENCES `kitchen_ticket`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_created_by_app_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_delivered_by_app_user_id_fk` FOREIGN KEY (`delivered_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_cancelled_by_app_user_id_fk` FOREIGN KEY (`cancelled_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_cancel_authorized_by_app_user_id_fk` FOREIGN KEY (`cancel_authorized_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item_modifier` ADD CONSTRAINT `order_item_modifier_order_item_id_order_item_id_fk` FOREIGN KEY (`order_item_id`) REFERENCES `order_item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item_modifier` ADD CONSTRAINT `order_item_modifier_modifier_id_modifier_id_fk` FOREIGN KEY (`modifier_id`) REFERENCES `modifier`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_round` ADD CONSTRAINT `order_round_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_round` ADD CONSTRAINT `order_round_order_id_customer_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `customer_order`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_round` ADD CONSTRAINT `order_round_sent_by_app_user_id_fk` FOREIGN KEY (`sent_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store_sequence` ADD CONSTRAINT `store_sequence_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Permissão nova (E6-2): cadastro de mesas
INSERT INTO `permission` (`code`, `description`) VALUES
  ('tables.configure', 'Cadastrar e desativar mesas');--> statement-breakpoint
-- ADMIN e GERENTE (ids fixos dos perfis de sistema — migration 0002)
INSERT INTO `role_permission` (`role_id`, `permission_code`) VALUES
  (UNHEX('01a0e93e47ee703ca803db3504ddbba0'), 'tables.configure'),
  (UNHEX('01a0e93e47ef74d688923b6a7672a05a'), 'tables.configure');
