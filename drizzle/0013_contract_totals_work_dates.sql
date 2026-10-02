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
ALTER TABLE `timesheets` DROP INDEX `timesheets_user_project_date`;
--> statement-breakpoint
ALTER TABLE `timesheets` MODIFY `date` date NOT NULL;
--> statement-breakpoint
ALTER TABLE `timesheets` ADD CONSTRAINT `timesheets_user_project_date` UNIQUE (`userId`, `projectId`, `date`);
--> statement-breakpoint
UPDATE `contracts` c
INNER JOIN (
  SELECT `contractId`, SUM(`amount`) AS `total`
  FROM `contract_payments`
  WHERE `status` <> 'cancelled'
  GROUP BY `contractId`
) p ON p.`contractId` = c.`id`
SET c.`totalValue` = p.`total`
WHERE CAST(c.`totalValue` AS DECIMAL(18,2)) = 0
  AND p.`total` > 0;
