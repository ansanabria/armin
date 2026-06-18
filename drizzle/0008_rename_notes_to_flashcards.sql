-- Rename the authored unit (note -> flashcard) and the generated review item
-- (card -> review_unit) across tables, columns and indexes. Pure terminology
-- alignment with the project glossary; all data is preserved.

ALTER TABLE `notes` RENAME TO `flashcards`;
--> statement-breakpoint
ALTER TABLE `cards` RENAME TO `review_units`;
--> statement-breakpoint
ALTER TABLE `note_prereqs` RENAME TO `flashcard_prereqs`;
--> statement-breakpoint
ALTER TABLE `note_tags` RENAME TO `flashcard_tags`;
--> statement-breakpoint
ALTER TABLE `review_units` RENAME COLUMN `note_id` TO `flashcard_id`;
--> statement-breakpoint
ALTER TABLE `review_logs` RENAME COLUMN `card_id` TO `review_unit_id`;
--> statement-breakpoint
ALTER TABLE `flashcard_tags` RENAME COLUMN `note_id` TO `flashcard_id`;
--> statement-breakpoint
ALTER TABLE `settings` RENAME COLUMN `new_cards_per_day` TO `new_review_units_per_day`;
--> statement-breakpoint
DROP INDEX IF EXISTS `notes_deck_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `notes_deck_created_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `notes_deck_locked_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_note_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_created_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_due_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_state_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_locked_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `cards_deck_archived_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `note_prereqs_dependent_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `note_prereqs_prereq_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `note_tags_tag_id_idx`;
--> statement-breakpoint
CREATE INDEX `flashcards_deck_id_idx` ON `flashcards` (`deck_id`);
--> statement-breakpoint
CREATE INDEX `flashcards_deck_created_idx` ON `flashcards` (`deck_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `flashcards_deck_locked_idx` ON `flashcards` (`deck_id`,`locked`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_id_idx` ON `review_units` (`deck_id`);
--> statement-breakpoint
CREATE INDEX `review_units_flashcard_id_idx` ON `review_units` (`flashcard_id`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_created_idx` ON `review_units` (`deck_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_due_idx` ON `review_units` (`deck_id`,`due`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_state_idx` ON `review_units` (`deck_id`,`state`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_locked_idx` ON `review_units` (`deck_id`,`locked`);
--> statement-breakpoint
CREATE INDEX `review_units_deck_archived_idx` ON `review_units` (`deck_id`,`archived`);
--> statement-breakpoint
CREATE INDEX `flashcard_prereqs_dependent_idx` ON `flashcard_prereqs` (`dependent_id`);
--> statement-breakpoint
CREATE INDEX `flashcard_prereqs_prereq_idx` ON `flashcard_prereqs` (`prereq_id`);
--> statement-breakpoint
CREATE INDEX `flashcard_tags_tag_id_idx` ON `flashcard_tags` (`tag_id`);
