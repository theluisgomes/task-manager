-- Delta on top of 0002_team_collaboration. The tables created in 0002
-- (activity_log, task_attachments, task_comments, user_preferences), the
-- kpi_metrics drop, and the users/project_members/kpi_categories changes are
-- already applied there, so this migration only carries the remaining column
-- type tweaks. Keeping it minimal makes `drizzle-kit migrate` idempotent on a
-- fresh database (0000 → 0003) with no manual journal stamping.
ALTER TABLE `columns` MODIFY COLUMN `color` varchar(32);--> statement-breakpoint
ALTER TABLE `kpi_entries` MODIFY COLUMN `actual` decimal(18,2);--> statement-breakpoint
ALTER TABLE `kpi_entries` MODIFY COLUMN `projected` decimal(18,2);--> statement-breakpoint
ALTER TABLE `kpi_entries` MODIFY COLUMN `budget` decimal(18,2);--> statement-breakpoint
ALTER TABLE `kpi_entries` MODIFY COLUMN `label` varchar(64);--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `color` varchar(32);--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `icon` varchar(64);--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `status` enum('active','completed','archived') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `team_invites` MODIFY COLUMN `name` text;
