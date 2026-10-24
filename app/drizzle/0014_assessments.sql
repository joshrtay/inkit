CREATE TABLE `assessments` (
	`game_id` text NOT NULL,
	`version` integer NOT NULL,
	`source` text NOT NULL,
	`solved` integer NOT NULL,
	`estimate` real,
	`quality` real NOT NULL,
	`flags` text NOT NULL,
	`measures` text NOT NULL,
	`ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`game_id`, `version`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
