CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`type` text DEFAULT 'basic' NOT NULL,
	`content` text NOT NULL,
	`pos_x` real,
	`pos_y` real,
	`locked` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_deck_id_idx` ON `notes` (`deck_id`);--> statement-breakpoint
CREATE INDEX `notes_deck_created_idx` ON `notes` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notes_deck_locked_idx` ON `notes` (`deck_id`,`locked`);--> statement-breakpoint
INSERT INTO `notes` (`id`, `deck_id`, `type`, `content`, `pos_x`, `pos_y`, `locked`, `created_at`, `updated_at`)
SELECT `id`, `deck_id`, `type`, json_object('front', `front`, 'back', `back`), `pos_x`, `pos_y`, `locked`, `created_at`, `updated_at`
FROM `cards`;--> statement-breakpoint
ALTER TABLE `cards` ADD `note_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `sub_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `cards` SET `note_id` = `id`;--> statement-breakpoint
CREATE INDEX `cards_note_id_idx` ON `cards` (`note_id`);--> statement-breakpoint
ALTER TABLE `cards` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `cards` DROP COLUMN `pos_x`;--> statement-breakpoint
ALTER TABLE `cards` DROP COLUMN `pos_y`;--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_tags_tag_id_idx` ON `note_tags` (`tag_id`);--> statement-breakpoint
INSERT INTO `note_tags` (`note_id`, `tag_id`) SELECT `card_id`, `tag_id` FROM `card_tags`;--> statement-breakpoint
CREATE TABLE `note_prereqs` (
	`prereq_id` text NOT NULL,
	`dependent_id` text NOT NULL,
	PRIMARY KEY(`prereq_id`, `dependent_id`),
	FOREIGN KEY (`prereq_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dependent_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_prereqs_dependent_idx` ON `note_prereqs` (`dependent_id`);--> statement-breakpoint
CREATE INDEX `note_prereqs_prereq_idx` ON `note_prereqs` (`prereq_id`);--> statement-breakpoint
INSERT INTO `note_prereqs` (`prereq_id`, `dependent_id`) SELECT `prereq_id`, `dependent_id` FROM `card_prereqs`;--> statement-breakpoint
DROP TABLE `card_tags`;--> statement-breakpoint
DROP TABLE `card_prereqs`;
