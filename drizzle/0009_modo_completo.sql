ALTER TABLE `projects` ADD `strategicPriority` enum('normal','high','very_high') NOT NULL DEFAULT 'normal';
--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_assignees_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_assignees_task_user` UNIQUE(`taskId`,`userId`)
);
--> statement-breakpoint
INSERT INTO `task_assignees` (`taskId`, `userId`)
SELECT `id`, `assigneeId` FROM `tasks` WHERE `assigneeId` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `user_employment_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalValue` decimal(18,2) NOT NULL,
	`installments` int NOT NULL DEFAULT 1,
	`availableHoursPerMonth` decimal(8,2) NOT NULL,
	`hourlyRate` decimal(10,2),
	`periodStart` timestamp,
	`periodEnd` timestamp,
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_employment_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_reminder_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` int NOT NULL,
	`sentTo` varchar(320) NOT NULL,
	`reminderDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_reminder_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_reminder_payment_date` UNIQUE(`paymentId`,`reminderDate`)
);
