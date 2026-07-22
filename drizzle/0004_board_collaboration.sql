ALTER TABLE `boards` ADD `accessMode` enum('project','restricted') DEFAULT 'project' NOT NULL;--> statement-breakpoint
CREATE TABLE `board_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`boardId` int NOT NULL,
	`userId` int NOT NULL,
	`addedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `board_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `board_members_board_user` UNIQUE(`boardId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `team_invites` ADD `boardId` int;
