-- Etapa 5 — Estoque e ficha técnica (docs/modules/inventory.md §9, recipes.md §6). Gerada pelo
-- drizzle-kit e REVISADA: índices criados ANTES das chaves estrangeiras (nomes próprios);
-- triggers de imutabilidade de stock_movement escritos à mão (RN-INV-17, como audit_log).

CREATE TABLE `ingredient` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`name` varchar(80) NOT NULL,
	`base_unit` enum('g','ml','un') NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ingredient_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ingredient_company_name` UNIQUE(`company_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `ingredient_stock` (
	`store_id` binary(16) NOT NULL,
	`ingredient_id` binary(16) NOT NULL,
	`quantity` decimal(14,3) NOT NULL DEFAULT '0.000',
	`avg_unit_cost` decimal(18,6) NOT NULL DEFAULT '0.000000',
	`min_quantity` decimal(14,3) NOT NULL DEFAULT '0.000',
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ingredient_stock_pk` PRIMARY KEY(`store_id`,`ingredient_id`),
	CONSTRAINT `ck_ingredient_stock_cost` CHECK(`ingredient_stock`.`avg_unit_cost` >= 0),
	CONSTRAINT `ck_ingredient_stock_min` CHECK(`ingredient_stock`.`min_quantity` >= 0)
);
--> statement-breakpoint
CREATE TABLE `ingredient_unit_conversion` (
	`id` binary(16) NOT NULL,
	`ingredient_id` binary(16) NOT NULL,
	`unit_name` varchar(20) NOT NULL,
	`factor_to_base` decimal(14,3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ingredient_unit_conversion_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ingredient_conversion_name` UNIQUE(`ingredient_id`,`unit_name`),
	CONSTRAINT `ck_ingredient_conversion_factor` CHECK(`ingredient_unit_conversion`.`factor_to_base` > 0)
);
--> statement-breakpoint
CREATE TABLE `stock_movement` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`ingredient_id` binary(16) NOT NULL,
	`type` enum('ENTRADA','SAIDA','AJUSTE','PERDA','CONSUMO_VENDA','ESTORNO_VENDA') NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(18,6) NOT NULL,
	`value_cents` bigint NOT NULL,
	`balance_after` decimal(14,3) NOT NULL,
	`loss_reason` enum('VENCIDO','ESTRAGADO','ERRO_PREPARO','QUEBRA','OUTRO','CANCELAMENTO_APOS_PREPARO'),
	`note` varchar(200),
	`entered_text` varchar(40),
	`origin_type` enum('MANUAL','ORDER_ITEM') NOT NULL,
	`origin_id` binary(16),
	`user_id` binary(16) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`operational_date` date NOT NULL,
	CONSTRAINT `stock_movement_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`product_id` binary(16),
	`modifier_id` binary(16),
	`version` int unsigned NOT NULL DEFAULT 0,
	`updated_by` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `recipe_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_recipe_product` UNIQUE(`product_id`),
	CONSTRAINT `uq_recipe_modifier` UNIQUE(`modifier_id`),
	CONSTRAINT `ck_recipe_owner` CHECK((`recipe`.`product_id` IS NULL) <> (`recipe`.`modifier_id` IS NULL))
);
--> statement-breakpoint
CREATE TABLE `recipe_item` (
	`id` binary(16) NOT NULL,
	`recipe_id` binary(16) NOT NULL,
	`ingredient_id` binary(16) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `recipe_item_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_recipe_item_ingredient` UNIQUE(`recipe_id`,`ingredient_id`),
	CONSTRAINT `ck_recipe_item_quantity` CHECK(`recipe_item`.`quantity` > 0)
);
--> statement-breakpoint
CREATE INDEX `ix_ingredient_stock_ingredient` ON `ingredient_stock` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `ix_stock_movement_ingredient_time` ON `stock_movement` (`store_id`,`ingredient_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_stock_movement_day_type` ON `stock_movement` (`store_id`,`operational_date`,`type`);--> statement-breakpoint
CREATE INDEX `ix_stock_movement_origin` ON `stock_movement` (`origin_type`,`origin_id`);--> statement-breakpoint
CREATE INDEX `ix_stock_movement_ingredient` ON `stock_movement` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `ix_recipe_company` ON `recipe` (`company_id`);--> statement-breakpoint
CREATE INDEX `ix_recipe_item_ingredient` ON `recipe_item` (`ingredient_id`);--> statement-breakpoint
ALTER TABLE `ingredient` ADD CONSTRAINT `ingredient_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_stock` ADD CONSTRAINT `ingredient_stock_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_stock` ADD CONSTRAINT `ingredient_stock_ingredient_id_ingredient_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_unit_conversion` ADD CONSTRAINT `ingredient_unit_conversion_ingredient_id_ingredient_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_ingredient_id_ingredient_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe` ADD CONSTRAINT `recipe_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe` ADD CONSTRAINT `recipe_product_id_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe` ADD CONSTRAINT `recipe_modifier_id_modifier_id_fk` FOREIGN KEY (`modifier_id`) REFERENCES `modifier`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_item` ADD CONSTRAINT `recipe_item_recipe_id_recipe_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_item` ADD CONSTRAINT `recipe_item_ingredient_id_ingredient_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredient`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- RN-INV-17: movimentação de estoque é imutável — corrigir = nova movimentação
CREATE TRIGGER `trg_stock_movement_no_update` BEFORE UPDATE ON `stock_movement` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'stock_movement aceita somente inclusao';
--> statement-breakpoint
CREATE TRIGGER `trg_stock_movement_no_delete` BEFORE DELETE ON `stock_movement` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'stock_movement aceita somente inclusao';
