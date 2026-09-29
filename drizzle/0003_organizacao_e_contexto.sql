-- Etapa 3 — Organização e contexto. Gerada pelo drizzle-kit e REVISADA; blocos de dados à mão.
-- Configurações da loja (RN-ORG-04), terminais (RN-ORG-08), estação de cozinha padrão (RN-ORG-10),
-- permissão terminals.manage (E3-1) e FK da idempotência para a loja (D-4).

CREATE TABLE `kitchen_station` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`name` varchar(60) NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `kitchen_station_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_kitchen_station_store_name` UNIQUE(`store_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `terminal` (
	`id` binary(16) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(60) NOT NULL,
	`kind` enum('CAIXA','KDS','MOVEL') NOT NULL,
	`device_id` binary(16),
	`active` boolean NOT NULL DEFAULT true,
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `terminal_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_terminal_store_code` UNIQUE(`store_id`,`code`),
	CONSTRAINT `uq_terminal_device` UNIQUE(`device_id`)
);
--> statement-breakpoint
ALTER TABLE `company` ADD `version` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD `operational_day_cutoff` time DEFAULT '05:00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD `service_fee_bp` int unsigned DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD `negative_stock_policy` enum('PERMITIR_COM_ALERTA','BLOQUEAR') DEFAULT 'PERMITIR_COM_ALERTA' NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD `max_open_cash_sessions` smallint unsigned DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `kitchen_station` ADD CONSTRAINT `kitchen_station_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminal` ADD CONSTRAINT `terminal_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminal` ADD CONSTRAINT `terminal_device_id_known_device_id_fk` FOREIGN KEY (`device_id`) REFERENCES `known_device`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store` ADD CONSTRAINT `ck_store_service_fee_bp` CHECK (`store`.`service_fee_bp` <= 10000);--> statement-breakpoint
ALTER TABLE `store` ADD CONSTRAINT `ck_store_max_open_cash_sessions` CHECK (`store`.`max_open_cash_sessions` BETWEEN 1 AND 20);--> statement-breakpoint
-- Registros técnicos de idempotência sem loja existente (só em bancos de teste antigos) impediriam
-- a chave estrangeira; são descartáveis (expiram em 24 h).
DELETE FROM `idempotency_record` WHERE `store_id` NOT IN (SELECT `id` FROM `store`);--> statement-breakpoint
ALTER TABLE `idempotency_record` ADD CONSTRAINT `idempotency_record_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Permissão nova (E3-1): gerente registra terminais sem depender do dono
INSERT INTO `permission` (`code`, `description`) VALUES
  ('terminals.manage', 'Cadastrar terminais e vincular aparelhos');
--> statement-breakpoint
INSERT INTO `role_permission` (`role_id`, `permission_code`) VALUES
  (UNHEX('01a0e93e47ee703ca803db3504ddbba0'), 'terminals.manage'),
  (UNHEX('01a0e93e47ef74d688923b6a7672a05a'), 'terminals.manage');
--> statement-breakpoint
-- Estação padrão "Cozinha" para as lojas que já existem (as novas recebem pelo código).
-- Id UUIDv7 montado no SQL: 48 bits de milissegundos + versão 7 + variante 10 + bits aleatórios.
INSERT INTO `kitchen_station` (`id`, `store_id`, `name`, `is_default`)
  SELECT UNHEX(CONCAT(
      LPAD(HEX(CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS UNSIGNED)), 12, '0'),
      '7', SUBSTR(HEX(RANDOM_BYTES(2)), 2, 3),
      HEX((ASCII(RANDOM_BYTES(1)) & 0x3F) | 0x80),
      SUBSTR(HEX(RANDOM_BYTES(8)), 1, 14))),
    `id`, 'Cozinha', true
  FROM `store`;