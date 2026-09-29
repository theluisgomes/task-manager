ALTER TABLE `proposals` ADD `installments` json;
--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`projectId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`startAt` timestamp NOT NULL,
	`endAt` timestamp,
	`allDay` boolean NOT NULL DEFAULT true,
	`kind` enum('reuniao','entrega','marco','outro') NOT NULL DEFAULT 'outro',
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendar_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `calendar_events_contract_idx` ON `calendar_events` (`contractId`);
--> statement-breakpoint
CREATE INDEX `calendar_events_start_idx` ON `calendar_events` (`startAt`);
