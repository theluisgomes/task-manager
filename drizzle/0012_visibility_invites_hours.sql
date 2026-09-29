ALTER TABLE `projects` ADD `visibility` enum('private','shared') NOT NULL DEFAULT 'private';
--> statement-breakpoint
UPDATE `projects` p
SET p.`visibility` = 'shared'
WHERE (
  SELECT COUNT(*) FROM `project_members` pm WHERE pm.`projectId` = p.`id`
) > 1
OR EXISTS (
  SELECT 1 FROM `boards` b
  INNER JOIN `board_members` bm ON bm.`boardId` = b.`id`
  WHERE b.`projectId` = p.`id` AND bm.`userId` <> p.`ownerId`
);
--> statement-breakpoint
CREATE TABLE `team_invite_projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `inviteId` int NOT NULL,
  `projectId` int NOT NULL,
  CONSTRAINT `team_invite_projects_id` PRIMARY KEY(`id`),
  CONSTRAINT `team_invite_projects_invite_project` UNIQUE(`inviteId`,`projectId`)
);
--> statement-breakpoint
INSERT INTO `team_invite_projects` (`inviteId`, `projectId`)
SELECT `id`, `projectId` FROM `team_invites`;
--> statement-breakpoint
UPDATE `timesheets` t
INNER JOIN (
  SELECT `keepId`, `totalHours` FROM (
    SELECT MAX(`id`) AS `keepId`, SUM(`hours`) AS `totalHours`
    FROM `timesheets`
    GROUP BY `userId`, `projectId`, DATE(`date`)
  ) grouped
) k ON t.`id` = k.`keepId`
SET t.`hours` = k.`totalHours`;
--> statement-breakpoint
DELETE t FROM `timesheets` t
INNER JOIN (
  SELECT `id` FROM (
    SELECT t2.`id`
    FROM `timesheets` t2
    INNER JOIN (
      SELECT `userId`, `projectId`, DATE(`date`) AS `workDay`, MAX(`id`) AS `keepId`
      FROM `timesheets`
      GROUP BY `userId`, `projectId`, DATE(`date`)
    ) k ON t2.`userId` = k.`userId` AND t2.`projectId` = k.`projectId` AND DATE(t2.`date`) = k.`workDay` AND t2.`id` <> k.`keepId`
  ) doomed
) d ON t.`id` = d.`id`;
--> statement-breakpoint
UPDATE `timesheets` SET `date` = TIMESTAMP(DATE(`date`));
--> statement-breakpoint
CREATE UNIQUE INDEX `timesheets_user_project_date` ON `timesheets` (`userId`,`projectId`,`date`);
