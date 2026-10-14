ALTER TABLE `handovers` ADD `client_request_key` text;--> statement-breakpoint
ALTER TABLE `handovers` ADD `payload_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `handovers_client_request_idx` ON `handovers` (`store_id`,`author_email`,`client_request_key`);
