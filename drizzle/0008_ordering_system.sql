CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`english_name` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `menu_categories_store_sort_idx` ON `menu_categories` (`store_id`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`english_name` text,
	`description` text,
	`base_price` integer NOT NULL,
	`image_url` text NOT NULL,
	`badge` text,
	`is_available` integer DEFAULT true NOT NULL,
	`allows_size` integer DEFAULT true NOT NULL,
	`allows_sugar` integer DEFAULT true NOT NULL,
	`allows_ice` integer DEFAULT true NOT NULL,
	`allows_toppings` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `menu_items_store_category_idx` ON `menu_items` (`store_id`,`category_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `menu_items_store_available_idx` ON `menu_items` (`store_id`,`is_available`);
--> statement-breakpoint
CREATE TABLE `menu_options` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`group_type` text NOT NULL,
	`name` text NOT NULL,
	`price_modifier` integer DEFAULT 0 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `menu_options_store_group_idx` ON `menu_options` (`store_id`,`group_type`,`sort_order`);
--> statement-breakpoint
CREATE TABLE `customer_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_code` text NOT NULL,
	`store_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_note` text,
	`total_amount` integer NOT NULL,
	`item_count` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`cancel_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
--> statement-breakpoint
CREATE INDEX `customer_orders_store_status_idx` ON `customer_orders` (`store_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `customer_orders_customer_phone_idx` ON `customer_orders` (`customer_phone`);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text,
	`item_name` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`subtotal` integer NOT NULL,
	`size_label` text,
	`sugar_level` text,
	`ice_level` text,
	`toppings_json` text,
	`item_note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_email` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `customer_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_id_idx` ON `order_status_history` (`order_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `store_ordering_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`is_ordering_open` integer DEFAULT true NOT NULL,
	`announcement` text,
	`opening_hours_notice` text DEFAULT '08:00 - 22:30',
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_ordering_settings_store_id_idx` ON `store_ordering_settings` (`store_id`);
