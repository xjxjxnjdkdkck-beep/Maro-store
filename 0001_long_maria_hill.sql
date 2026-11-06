CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`description` text,
	`icon` varchar(40) DEFAULT 'sparkles',
	`accent` varchar(20) DEFAULT 'blue',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(180) NOT NULL,
	`unitPrice` decimal(12,2) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`deliveredCodeId` int,
	`deliveredCode` text,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNo` varchar(40) NOT NULL,
	`userId` int,
	`customerName` varchar(160) NOT NULL,
	`customerContact` varchar(160) NOT NULL,
	`notes` text,
	`total` decimal(12,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`status` enum('pending','paid','processing','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNo_unique` UNIQUE(`orderNo`)
);
--> statement-breakpoint
CREATE TABLE `product_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`code` text NOT NULL,
	`status` enum('available','reserved','delivered') NOT NULL DEFAULT 'available',
	`deliveredToOrderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	CONSTRAINT `product_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`imageUrl` text,
	`badge` varchar(60),
	`accent` varchar(20) DEFAULT 'blue',
	`active` boolean NOT NULL DEFAULT true,
	`featured` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(80) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `product_codes_product_idx` ON `product_codes` (`productId`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`categoryId`);