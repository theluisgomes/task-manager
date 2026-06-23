ALTER TABLE `users` MODIFY `openId` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `project_members` CHANGE `joinedAt` `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `project_members` MODIFY `role` enum('owner','admin','member') NOT NULL DEFAULT 'member';--> statement-breakpoint
ALTER TABLE `kpi_categories` ADD `createdById` int NOT NULL DEFAULT 1;--> statement-breakpoint
DROP TABLE IF EXISTS `kpi_metrics`;--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`userId` int NOT NULL,
	`emailOnAssignment` boolean NOT NULL DEFAULT true,
	`emailOnMention` boolean NOT NULL DEFAULT true,
	`emailOnInviteAccepted` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`contentType` varchar(128),
	`sizeBytes` int,
	`uploadedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int,
	`projectId` int,
	`userId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
