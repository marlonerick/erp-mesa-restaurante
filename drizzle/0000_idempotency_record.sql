CREATE TABLE `idempotency_record` (
	`store_id` binary(16) NOT NULL,
	`idem_key` varchar(64) NOT NULL,
	`operation` varchar(64) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`response` json,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `pk_idempotency_record` PRIMARY KEY(`store_id`,`idem_key`)
);
--> statement-breakpoint
CREATE INDEX `ix_idempotency_record_created_at` ON `idempotency_record` (`created_at`);