CREATE TABLE `tutor_answers` (
	`game_id` text NOT NULL,
	`key` text NOT NULL,
	`answer` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`game_id`, `key`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tutor_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`ask` text,
	`turn` integer NOT NULL,
	`by` text NOT NULL,
	`reply` text NOT NULL,
	`move` integer NOT NULL,
	`mistake` integer NOT NULL,
	`wrong` integer NOT NULL,
	`target` text NOT NULL,
	`cost` real,
	`problems` text,
	`model` text,
	`version` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tutor_turns_creator` ON `tutor_turns` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `tutor_turns_created` ON `tutor_turns` (`created_at`);--> statement-breakpoint
CREATE INDEX `tutor_turns_game` ON `tutor_turns` (`game_id`);