ALTER TABLE `strategy_builds` ADD `content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `strategy_builds` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `strategy_builds` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `strategy_builds` ADD `updated_at` integer;