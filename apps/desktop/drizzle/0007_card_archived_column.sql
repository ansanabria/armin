ALTER TABLE `notes` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `cards_deck_archived_idx` ON `cards` (`deck_id`,`archived`);--> statement-breakpoint
UPDATE `notes` SET `archived` = 0;--> statement-breakpoint
UPDATE `cards` SET `archived` = 0;
