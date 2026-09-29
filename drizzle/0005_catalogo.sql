-- Etapa 4 — Catálogo (docs/modules/catalog.md §9). Gerada pelo drizzle-kit e REVISADA:
-- índices criados ANTES das chaves estrangeiras (senão o MySQL cria índices com nome automático,
-- fora do snapshot); permissão products.availability (E4-1) escrita à mão.

CREATE TABLE `category` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`name` varchar(60) NOT NULL,
	`sort_order` smallint unsigned NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `category_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_category_company_name` UNIQUE(`company_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `modifier` (
	`id` binary(16) NOT NULL,
	`modifier_group_id` binary(16) NOT NULL,
	`name` varchar(60) NOT NULL,
	`price_delta_cents` int unsigned NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `modifier_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_modifier_group_name` UNIQUE(`modifier_group_id`,`name`),
	CONSTRAINT `ck_modifier_price` CHECK(`modifier`.`price_delta_cents` <= 999999)
);
--> statement-breakpoint
CREATE TABLE `modifier_group` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`name` varchar(60) NOT NULL,
	`min_select` tinyint unsigned NOT NULL DEFAULT 0,
	`max_select` tinyint unsigned NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `modifier_group_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_modifier_group_company_name` UNIQUE(`company_id`,`name`),
	CONSTRAINT `ck_modifier_group_limits` CHECK(`modifier_group`.`min_select` <= `modifier_group`.`max_select`),
	CONSTRAINT `ck_modifier_group_max` CHECK(`modifier_group`.`max_select` BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE `product` (
	`id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`category_id` binary(16) NOT NULL,
	`name` varchar(80) NOT NULL,
	`sku` varchar(30),
	`description` varchar(300),
	`requires_preparation` boolean NOT NULL DEFAULT true,
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `product_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_product_company_name` UNIQUE(`company_id`,`name`),
	CONSTRAINT `uq_product_company_sku` UNIQUE(`company_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `product_modifier_group` (
	`product_id` binary(16) NOT NULL,
	`modifier_group_id` binary(16) NOT NULL,
	CONSTRAINT `product_modifier_group_pk` PRIMARY KEY(`product_id`,`modifier_group_id`)
);
--> statement-breakpoint
CREATE TABLE `product_store` (
	`store_id` binary(16) NOT NULL,
	`product_id` binary(16) NOT NULL,
	`price_cents` int unsigned NOT NULL,
	`available` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `product_store_pk` PRIMARY KEY(`store_id`,`product_id`),
	CONSTRAINT `ck_product_store_price` CHECK(`product_store`.`price_cents` <= 9999999)
);
--> statement-breakpoint
CREATE INDEX `ix_product_category` ON `product` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_product_modifier_group_group` ON `product_modifier_group` (`modifier_group_id`);--> statement-breakpoint
CREATE INDEX `ix_product_store_product` ON `product_store` (`product_id`);--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modifier` ADD CONSTRAINT `modifier_modifier_group_id_modifier_group_id_fk` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_group`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modifier_group` ADD CONSTRAINT `modifier_group_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product` ADD CONSTRAINT `product_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product` ADD CONSTRAINT `product_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_modifier_group` ADD CONSTRAINT `product_modifier_group_product_id_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_modifier_group` ADD CONSTRAINT `product_modifier_group_modifier_group_id_modifier_group_id_fk` FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_group`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_store` ADD CONSTRAINT `product_store_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_store` ADD CONSTRAINT `product_store_product_id_product_id_fk` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Permissão nova (E4-1): marcar "acabou"/"disponível" na loja
INSERT INTO `permission` (`code`, `description`) VALUES
  ('products.availability', 'Marcar produto esgotado ou disponível na loja');
--> statement-breakpoint
-- ADMIN, GERENTE, CAIXA e COZINHA (ids fixos dos perfis de sistema — migration 0002)
INSERT INTO `role_permission` (`role_id`, `permission_code`) VALUES
  (UNHEX('01a0e93e47ee703ca803db3504ddbba0'), 'products.availability'),
  (UNHEX('01a0e93e47ef74d688923b6a7672a05a'), 'products.availability'),
  (UNHEX('01a0e93e47ef74d688923f456b8ce0b3'), 'products.availability'),
  (UNHEX('01a0e93e47ef74d68892470c6dcec724'), 'products.availability');