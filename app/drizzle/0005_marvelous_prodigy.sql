CREATE TABLE `reads` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text,
	`creator_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`kind` text NOT NULL,
	`image_key` text,
	`feedback` text,
	`chosen_kind` text,
	`attempts` text NOT NULL,
	`model` text,
	`reading` text,
	`sketch` text,
	`puzzle_kind` text,
	`error` text,
	`published_sketch` text,
	`published_at` integer,
	`diff` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reads_game` ON `reads` (`game_id`);--> statement-breakpoint
CREATE INDEX `reads_created` ON `reads` (`created_at`);