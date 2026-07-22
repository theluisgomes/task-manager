ALTER TABLE `projects` ADD COLUMN `area` enum('prospectos','clientes','juridico','financeiro','comunicacao') NOT NULL DEFAULT 'clientes';--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `leadId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `linkedProjectId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `contractId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `acquisitionOwnerId` int;--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`dependsOnTaskId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_dependencies_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_dependencies_unique` UNIQUE(`taskId`,`dependsOnTaskId`)
);--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`date` timestamp NOT NULL,
	`hours` decimal(6,2) NOT NULL,
	`description` varchar(512),
	`hourlyRate` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `timesheets_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `timesheets_project_idx` ON `timesheets` (`projectId`);--> statement-breakpoint
CREATE TABLE `user_contract_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`availableHours` decimal(8,2) NOT NULL,
	`hourlyRate` decimal(10,2),
	`periodStart` timestamp,
	`periodEnd` timestamp,
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_contract_allocations_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `user_contract_allocations_project_idx` ON `user_contract_allocations` (`projectId`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientId` int,
	`projectId` int,
	`title` varchar(255) NOT NULL,
	`estimatedValue` decimal(18,2),
	`probability` int DEFAULT 50,
	`status` enum('prospecting','proposal','negotiation','won','lost') NOT NULL DEFAULT 'prospecting',
	`isHot` boolean NOT NULL DEFAULT false,
	`dueDiligenceNotes` text,
	`dueDiligenceCompletedAt` timestamp,
	`expectedCloseDate` timestamp,
	`source` varchar(128),
	`responsibleId` int,
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `leads_project_idx` ON `leads` (`projectId`);--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int,
	`projectId` int,
	`clientName` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`totalValue` decimal(18,2) NOT NULL,
	`budgetedCost` decimal(18,2),
	`startDate` timestamp,
	`endDate` timestamp,
	`status` enum('draft','active','completed','cancelled') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `contracts_project_idx` ON `contracts` (`projectId`);--> statement-breakpoint
CREATE TABLE `contract_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`description` varchar(255),
	`amount` decimal(18,2) NOT NULL,
	`dueDate` timestamp,
	`paidAt` timestamp,
	`status` enum('pending','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
	`deliveryCompleted` boolean NOT NULL DEFAULT false,
	`invoiceIssued` boolean NOT NULL DEFAULT false,
	`paymentReceived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contract_payments_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `contract_payments_contract_idx` ON `contract_payments` (`contractId`);--> statement-breakpoint
CREATE TABLE `alert_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('payment_due','delivery_due','hot_lead') NOT NULL,
	`daysBefore` int NOT NULL DEFAULT 3,
	`enabled` boolean NOT NULL DEFAULT true,
	`notifyAdmin` boolean NOT NULL DEFAULT true,
	`updatedById` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alert_settings_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
INSERT INTO `alert_settings` (`type`, `daysBefore`, `enabled`, `notifyAdmin`) VALUES
('payment_due', 3, true, true),
('delivery_due', 3, true, true),
('hot_lead', 7, true, true);
