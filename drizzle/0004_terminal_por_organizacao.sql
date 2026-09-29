-- Etapa 3 — correções da revisão (achados B-1 e sugestões 6 e 10). Gerada pelo drizzle-kit e
-- REORDENADA à mão: o MySQL não apaga um índice que uma chave estrangeira ainda usa, e a coluna
-- organization_id precisa ser preenchida (a partir da loja) antes de virar obrigatória.

-- B-1: o vínculo aparelho → terminal passa a valer POR ORGANIZAÇÃO
ALTER TABLE `terminal` DROP FOREIGN KEY `terminal_device_id_known_device_id_fk`;--> statement-breakpoint
ALTER TABLE `terminal` DROP INDEX `uq_terminal_device`;--> statement-breakpoint
ALTER TABLE `terminal` ADD `organization_id` binary(16);--> statement-breakpoint
UPDATE `terminal` t JOIN `store` s ON s.`id` = t.`store_id` SET t.`organization_id` = s.`organization_id`;--> statement-breakpoint
ALTER TABLE `terminal` MODIFY `organization_id` binary(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `terminal` ADD CONSTRAINT `terminal_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `terminal` ADD CONSTRAINT `uq_terminal_organization_device` UNIQUE(`organization_id`,`device_id`);--> statement-breakpoint
-- Sugestão 10: apagar um aparelho (limpeza futura) só desfaz o vínculo, não trava a limpeza
ALTER TABLE `terminal` ADD CONSTRAINT `terminal_device_id_known_device_id_fk` FOREIGN KEY (`device_id`) REFERENCES `known_device`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Sugestão 6: no máximo UMA estação padrão por loja (coluna calculada + índice único)
ALTER TABLE `kitchen_station` ADD `default_store_id` binary(16) GENERATED ALWAYS AS ((if(`is_default`, `store_id`, NULL))) STORED;--> statement-breakpoint
ALTER TABLE `kitchen_station` ADD CONSTRAINT `uq_kitchen_station_default` UNIQUE(`default_store_id`);
