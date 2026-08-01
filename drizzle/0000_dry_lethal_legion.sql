CREATE TABLE `strategy_builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`dataset_version` text NOT NULL,
	`plan_json` text NOT NULL,
	`author_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `strategy_builds_created_at_idx` ON `strategy_builds` (`created_at`);--> statement-breakpoint
CREATE INDEX `strategy_builds_author_hash_idx` ON `strategy_builds` (`author_hash`);--> statement-breakpoint
CREATE TABLE `strategy_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`build_id` integer NOT NULL,
	`voter_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`build_id`) REFERENCES `strategy_builds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strategy_votes_build_voter_idx` ON `strategy_votes` (`build_id`,`voter_hash`);--> statement-breakpoint
CREATE INDEX `strategy_votes_build_idx` ON `strategy_votes` (`build_id`);