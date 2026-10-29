ALTER TABLE `plays` ADD `creator_id` text REFERENCES creators(id);--> statement-breakpoint
CREATE INDEX `plays_creator` ON `plays` (`creator_id`);