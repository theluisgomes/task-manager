CREATE TABLE `boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `boards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `columns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`color` varchar(32) DEFAULT '#e2e8f0',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `columns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`type` enum('revenue','budget','variance','profitability') NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kpi_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`period` varchar(32) NOT NULL,
	`periodType` enum('monthly','quarterly','annual') NOT NULL DEFAULT 'monthly',
	`actual` float,
	`projected` float,
	`budget` float,
	`label` varchar(128),
	`notes` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`value` float NOT NULL,
	`previousValue` float,
	`unit` varchar(32) DEFAULT 'currency',
	`period` varchar(32) NOT NULL,
	`periodType` enum('monthly','quarterly','annual') NOT NULL DEFAULT 'monthly',
	`type` enum('revenue','budget','variance','profitability') NOT NULL,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member','viewer') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(32) DEFAULT '#6366f1',
	`icon` varchar(64) DEFAULT 'folder',
	`status` enum('active','archived','completed') NOT NULL DEFAULT 'active',
	`ownerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`columnId` int NOT NULL,
	`boardId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('todo','in_progress','in_review','done') NOT NULL DEFAULT 'todo',
	`assigneeId` int,
	`dueDate` timestamp,
	`position` int NOT NULL DEFAULT 0,
	`tags` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255),
	`token` varchar(128) NOT NULL,
	`invitedById` int NOT NULL,
	`status` enum('pending','accepted','expired') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `department` varchar(128);