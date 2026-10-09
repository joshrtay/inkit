CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`what` text NOT NULL,
	`expected` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`verdict` text,
	`verdict_error` text,
	`version` text DEFAULT '' NOT NULL,
	`route` text DEFAULT '' NOT NULL,
	`game_id` text,
	`has_replay` integer DEFAULT false NOT NULL,
	`has_screenshot` integer DEFAULT false NOT NULL,
	`duplicate_of` text,
	`issue_number` integer,
	`issue_url` text,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bug_reports_creator` ON `bug_reports` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_created` ON `bug_reports` (`created_at`);