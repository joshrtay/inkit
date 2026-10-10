CREATE TABLE `recommendations` (
	`recommender_id` text NOT NULL,
	`recommended_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`recommender_id`, `recommended_id`),
	FOREIGN KEY (`recommender_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recommended_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendations_recommended` ON `recommendations` (`recommended_id`);--> statement-breakpoint
ALTER TABLE `games` ADD `difficulty` real;--> statement-breakpoint
ALTER TABLE `games` ADD `level` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `minutes` integer;--> statement-breakpoint
CREATE INDEX `games_kind` ON `games` (`kind`,`state`,`published_at`);