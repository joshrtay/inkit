CREATE TABLE `set_items` (
	`set_id` text NOT NULL,
	`game_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`set_id`, `game_id`),
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `set_items_game` ON `set_items` (`game_id`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text DEFAULT 'Untitled set' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`hidden_note` text,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sets_collection` ON `sets` (`collection_id`,`state`);--> statement-breakpoint
CREATE INDEX `sets_published` ON `sets` (`state`,`published_at`);--> statement-breakpoint
CREATE INDEX `sets_author` ON `sets` (`author_id`);