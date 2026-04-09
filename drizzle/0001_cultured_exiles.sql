CREATE TABLE `comparison_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderNo` varchar(128),
	`shipmentOrderNo` varchar(128),
	`purchaseStoreName` varchar(256),
	`shipmentCustomerName` varchar(256),
	`storeNameMatch` enum('match','mismatch','missing') DEFAULT 'missing',
	`overallStatus` enum('all_match','has_diff','error') NOT NULL DEFAULT 'has_diff',
	`purchaseImageUrl` text,
	`shipmentImageUrl` text,
	`purchaseRawData` json,
	`shipmentRawData` json,
	`comparisonSummary` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comparison_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comparisonId` int NOT NULL,
	`source` enum('purchase','shipment') NOT NULL,
	`seq` int,
	`barcode` varchar(64),
	`itemName` text,
	`quantity` int,
	`matchStatus` enum('match','mismatch','missing') DEFAULT 'missing',
	`diffNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
