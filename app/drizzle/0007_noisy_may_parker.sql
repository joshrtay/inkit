ALTER TABLE `creators` ADD `is_ai` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `publish_at` integer;--> statement-breakpoint
CREATE INDEX `games_scheduled` ON `games` (`state`,`publish_at`);