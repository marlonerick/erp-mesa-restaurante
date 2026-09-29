-- Etapa 5 — correções da revisão (sugestão S-1): consistência da movimentação GARANTIDA NO BANCO.
-- Gerada pelo drizzle-kit e REVISADA: índice criado antes da FK de user_id (nome próprio).

CREATE INDEX `ix_stock_movement_user` ON `stock_movement` (`user_id`);--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `ck_stock_movement_quantity` CHECK (`stock_movement`.`quantity` <> 0);--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `ck_stock_movement_sign` CHECK ((`stock_movement`.`type` IN ('ENTRADA', 'ESTORNO_VENDA') AND `stock_movement`.`quantity` > 0)
        OR (`stock_movement`.`type` IN ('SAIDA', 'PERDA', 'CONSUMO_VENDA') AND `stock_movement`.`quantity` < 0)
        OR `stock_movement`.`type` = 'AJUSTE');--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `ck_stock_movement_loss_reason` CHECK ((`stock_movement`.`loss_reason` IS NULL) = (`stock_movement`.`type` <> 'PERDA'));--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `ck_stock_movement_origin` CHECK (`stock_movement`.`origin_type` = 'MANUAL' OR `stock_movement`.`origin_id` IS NOT NULL);--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;
