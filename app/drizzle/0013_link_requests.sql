CREATE TABLE `link_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`source` text NOT NULL,
	`genre_id` text NOT NULL,
	`genre_name` text NOT NULL,
	`variant` text,
	`link` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `link_requests_genre` ON `link_requests` (`genre_id`);