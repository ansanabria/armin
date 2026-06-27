CREATE INDEX `cards_deck_id_idx` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `cards_deck_created_idx` ON `cards` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cards_deck_due_idx` ON `cards` (`deck_id`,`due`);--> statement-breakpoint
CREATE INDEX `cards_deck_state_idx` ON `cards` (`deck_id`,`state`);--> statement-breakpoint
CREATE INDEX `card_prereqs_dependent_idx` ON `card_prereqs` (`dependent_id`);--> statement-breakpoint
CREATE INDEX `card_prereqs_prereq_idx` ON `card_prereqs` (`prereq_id`);--> statement-breakpoint
CREATE INDEX `card_tags_tag_id_idx` ON `card_tags` (`tag_id`);
