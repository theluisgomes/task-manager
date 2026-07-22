CREATE TABLE `platform_visits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`visitDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_visits_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_visits_user_date` UNIQUE(`userId`,`visitDate`)
);
