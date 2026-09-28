CREATE TABLE `audit_log` (
	`id` binary(16) NOT NULL,
	`organization_id` binary(16),
	`store_id` binary(16),
	`event` varchar(64) NOT NULL,
	`actor_user_id` binary(16),
	`authorizer_user_id` binary(16),
	`entity_type` varchar(40),
	`entity_id` varchar(64),
	`before_data` json,
	`after_data` json,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`request_id` varchar(64),
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_user` (
	`device_id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`last_password_login_at` datetime(3) NOT NULL,
	CONSTRAINT `pk_device_user` PRIMARY KEY(`device_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `known_device` (
	`id` binary(16) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`shared` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`last_seen_at` datetime(3) NOT NULL,
	CONSTRAINT `known_device_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_known_device_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_bucket` (
	`bucket_key` varchar(191) NOT NULL,
	`window_start` datetime NOT NULL,
	`hits` int unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `pk_rate_limit_bucket` PRIMARY KEY(`bucket_key`,`window_start`)
);
--> statement-breakpoint
CREATE TABLE `user_session` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`organization_id` binary(16) NOT NULL,
	`active_store_id` binary(16) NOT NULL,
	`device_id` binary(16),
	`login_method` enum('PASSWORD','PIN') NOT NULL,
	`idle_timeout_seconds` int unsigned NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`revoke_reason` varchar(30),
	CONSTRAINT `user_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_session_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `elevated_grant` (
	`id` binary(16) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`store_id` binary(16) NOT NULL,
	`permission_code` varchar(64) NOT NULL,
	`requester_user_id` binary(16) NOT NULL,
	`requester_session_id` binary(16) NOT NULL,
	`authorizer_user_id` binary(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	CONSTRAINT `elevated_grant_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_elevated_grant_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `permission` (
	`code` varchar(64) NOT NULL,
	`description` varchar(160) NOT NULL,
	CONSTRAINT `permission_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `role` (
	`id` binary(16) NOT NULL,
	`organization_id` binary(16),
	`code` varchar(30) NOT NULL,
	`name` varchar(60) NOT NULL,
	`max_discount_bp` int unsigned NOT NULL DEFAULT 0,
	`is_system` boolean NOT NULL DEFAULT false,
	CONSTRAINT `role_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_role_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permission` (
	`role_id` binary(16) NOT NULL,
	`permission_code` varchar(64) NOT NULL,
	CONSTRAINT `pk_role_permission` PRIMARY KEY(`role_id`,`permission_code`)
);
--> statement-breakpoint
CREATE TABLE `user_role_assignment` (
	`id` binary(16) NOT NULL,
	`user_id` binary(16) NOT NULL,
	`role_id` binary(16) NOT NULL,
	`scope_type` enum('ORGANIZATION','COMPANY','STORE') NOT NULL,
	`scope_id` binary(16) NOT NULL,
	`created_by` binary(16),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `user_role_assignment_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_role_assignment` UNIQUE(`user_id`,`role_id`,`scope_type`,`scope_id`)
);
--> statement-breakpoint
CREATE TABLE `company` (
	`id` binary(16) NOT NULL,
	`organization_id` binary(16) NOT NULL,
	`legal_name` varchar(150) NOT NULL,
	`trade_name` varchar(120) NOT NULL,
	`cnpj` char(14),
	`status` enum('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `company_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_company_cnpj` UNIQUE(`cnpj`)
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` binary(16) NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` enum('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `organization_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store` (
	`id` binary(16) NOT NULL,
	`organization_id` binary(16) NOT NULL,
	`company_id` binary(16) NOT NULL,
	`name` varchar(120) NOT NULL,
	`code` varchar(20) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`status` enum('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `store_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_store_company_code` UNIQUE(`company_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `app_user` (
	`id` binary(16) NOT NULL,
	`organization_id` binary(16) NOT NULL,
	`name` varchar(120) NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`pin_hash` varchar(255),
	`status` enum('ATIVO','DESATIVADO') NOT NULL DEFAULT 'ATIVO',
	`must_change_password` boolean NOT NULL DEFAULT false,
	`failed_pin_attempts` smallint unsigned NOT NULL DEFAULT 0,
	`pin_locked_at` datetime(3),
	`password_changed_at` datetime(3) NOT NULL,
	`disabled_at` datetime(3),
	`created_by` binary(16),
	`version` int unsigned NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `app_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_app_user_username` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `device_user` ADD CONSTRAINT `device_user_device_id_known_device_id_fk` FOREIGN KEY (`device_id`) REFERENCES `known_device`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_user` ADD CONSTRAINT `device_user_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_session` ADD CONSTRAINT `user_session_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_session` ADD CONSTRAINT `user_session_active_store_id_store_id_fk` FOREIGN KEY (`active_store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_session` ADD CONSTRAINT `user_session_device_id_known_device_id_fk` FOREIGN KEY (`device_id`) REFERENCES `known_device`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `elevated_grant` ADD CONSTRAINT `elevated_grant_store_id_store_id_fk` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `elevated_grant` ADD CONSTRAINT `elevated_grant_permission_code_permission_code_fk` FOREIGN KEY (`permission_code`) REFERENCES `permission`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `elevated_grant` ADD CONSTRAINT `elevated_grant_requester_user_id_app_user_id_fk` FOREIGN KEY (`requester_user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `elevated_grant` ADD CONSTRAINT `elevated_grant_requester_session_id_user_session_id_fk` FOREIGN KEY (`requester_session_id`) REFERENCES `user_session`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `elevated_grant` ADD CONSTRAINT `elevated_grant_authorizer_user_id_app_user_id_fk` FOREIGN KEY (`authorizer_user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role` ADD CONSTRAINT `role_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permission` ADD CONSTRAINT `role_permission_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permission` ADD CONSTRAINT `role_permission_permission_code_permission_code_fk` FOREIGN KEY (`permission_code`) REFERENCES `permission`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignment` ADD CONSTRAINT `user_role_assignment_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_role_assignment` ADD CONSTRAINT `user_role_assignment_role_id_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company` ADD CONSTRAINT `company_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store` ADD CONSTRAINT `store_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store` ADD CONSTRAINT `store_company_id_company_id_fk` FOREIGN KEY (`company_id`) REFERENCES `company`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_user` ADD CONSTRAINT `app_user_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_audit_log_store_time` ON `audit_log` (`store_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_log_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `ix_audit_log_store_event_time` ON `audit_log` (`store_id`,`event`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ix_user_session_user` ON `user_session` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `ix_user_session_device` ON `user_session` (`device_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `ix_user_session_expires` ON `user_session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_elevated_grant_expires` ON `elevated_grant` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_user_role_assignment_scope` ON `user_role_assignment` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `ix_company_organization` ON `company` (`organization_id`);--> statement-breakpoint
CREATE INDEX `ix_store_organization` ON `store` (`organization_id`);--> statement-breakpoint
CREATE INDEX `ix_app_user_organization` ON `app_user` (`organization_id`);