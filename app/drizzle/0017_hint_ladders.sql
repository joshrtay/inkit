CREATE TABLE `hint_ladders` (
	`game_id` text PRIMARY KEY NOT NULL,
	`ladder` text NOT NULL,
	`source` text NOT NULL,
	`sketch_hash` text NOT NULL,
	`verified` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
