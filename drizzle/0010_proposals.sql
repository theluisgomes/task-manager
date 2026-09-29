CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`leadId` int,
	`projectId` int,
	`clientName` varchar(255) NOT NULL,
	`contactName` varchar(255),
	`contactEmail` varchar(320),
	`title` varchar(255) NOT NULL,
	`intro` text,
	`scope` text,
	`items` json NOT NULL,
	`discount` decimal(18,2) NOT NULL DEFAULT '0',
	`total` decimal(18,2) NOT NULL DEFAULT '0',
	`paymentTerms` text,
	`deliveryTime` varchar(255),
	`validUntil` timestamp,
	`notes` text,
	`status` enum('draft','sent','accepted','rejected') NOT NULL DEFAULT 'draft',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `proposals_lead_idx` ON `proposals` (`leadId`);
