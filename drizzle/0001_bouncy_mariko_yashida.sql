ALTER TABLE `settings` ADD `prereq_stability_floor` real DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `new_cards_per_day` integer DEFAULT 10 NOT NULL;