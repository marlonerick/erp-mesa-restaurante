-- Etapa 7 — KDS (docs/modules/kitchen.md). Gerada pelo drizzle-kit e revisada:
-- índices ANTES das chaves estrangeiras (o MySQL reaproveita o índice e não cria um duplicado).

-- Tempos de alerta da cozinha por loja (Q-14, E7-1): amarelo aos 10 min, vermelho aos 20
ALTER TABLE `store` ADD `kds_warning_minutes` smallint unsigned DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD `kds_late_minutes` smallint unsigned DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `store` ADD CONSTRAINT `ck_store_kds_alerts` CHECK (`store`.`kds_warning_minutes` >= 1 AND `store`.`kds_warning_minutes` < `store`.`kds_late_minutes` AND `store`.`kds_late_minutes` <= 240);--> statement-breakpoint

-- Quando o ticket saiu da fila (pronto ou cancelado): "prontos há pouco" (RN-KDS-10)
ALTER TABLE `kitchen_ticket` ADD `finished_at` datetime(3);--> statement-breakpoint
CREATE INDEX `ix_kitchen_ticket_finished` ON `kitchen_ticket` (`store_id`,`station_id`,`finished_at`);--> statement-breakpoint
-- Tickets cancelados na Etapa 6: saíram da fila na última alteração
UPDATE `kitchen_ticket` SET `finished_at` = `updated_at` WHERE `status` IN ('PRONTO', 'CANCELADO');--> statement-breakpoint

-- Quem iniciou e quem terminou cada item na cozinha
ALTER TABLE `order_item` ADD `started_by` binary(16);--> statement-breakpoint
ALTER TABLE `order_item` ADD `ready_by` binary(16);--> statement-breakpoint
CREATE INDEX `ix_order_item_started_by` ON `order_item` (`started_by`);--> statement-breakpoint
CREATE INDEX `ix_order_item_ready_by` ON `order_item` (`ready_by`);--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_started_by_app_user_id_fk` FOREIGN KEY (`started_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_ready_by_app_user_id_fk` FOREIGN KEY (`ready_by`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;
