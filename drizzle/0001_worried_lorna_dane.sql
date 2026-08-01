CREATE TABLE `relation_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relation_type` text NOT NULL,
	`subject_skill_id` integer NOT NULL,
	`subject_mode` text NOT NULL,
	`related_skill_id` integer NOT NULL,
	`related_mode` text NOT NULL,
	`dataset_version` text NOT NULL,
	`evidence` text NOT NULL,
	`reporter_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `relation_reports_created_at_idx` ON `relation_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `relation_reports_reporter_hash_idx` ON `relation_reports` (`reporter_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `relation_reports_duplicate_idx` ON `relation_reports` (`reporter_hash`,`relation_type`,`subject_skill_id`,`subject_mode`,`related_skill_id`,`related_mode`,`dataset_version`);