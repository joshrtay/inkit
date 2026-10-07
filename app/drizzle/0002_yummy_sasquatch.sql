CREATE TABLE `subscriptions` (
	`subscriber_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`subscriber_id`, `collection_id`),
	FOREIGN KEY (`subscriber_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_collection` ON `subscriptions` (`collection_id`);--> statement-breakpoint
ALTER TABLE `games` ADD `kind_choices` text;