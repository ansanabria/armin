CREATE TABLE `deck_settings` (
	`deck_id` text PRIMARY KEY NOT NULL,
	`request_retention` real,
	`maximum_interval` integer,
	`enable_fuzz` integer,
	`enable_short_term` integer,
	`learning_steps` text,
	`relearning_steps` text,
	`weights` text,
	`prereq_stability_floor` real,
	`new_review_units_per_day` integer,
	`keep_sibling_review_units_together` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flashcard_prereqs` (
	`prereq_id` text NOT NULL,
	`dependent_id` text NOT NULL,
	PRIMARY KEY(`prereq_id`, `dependent_id`),
	FOREIGN KEY (`prereq_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dependent_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcard_prereqs_dependent_idx` ON `flashcard_prereqs` (`dependent_id`);--> statement-breakpoint
CREATE INDEX `flashcard_prereqs_prereq_idx` ON `flashcard_prereqs` (`prereq_id`);--> statement-breakpoint
CREATE TABLE `flashcard_tags` (
	`flashcard_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`flashcard_id`, `tag_id`),
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcard_tags_tag_id_idx` ON `flashcard_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`deck_id` text NOT NULL,
	`type` text DEFAULT 'basic' NOT NULL,
	`content` text NOT NULL,
	`pos_x` real,
	`pos_y` real,
	`locked` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcards_deck_id_idx` ON `flashcards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `flashcards_deck_created_idx` ON `flashcards` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `flashcards_deck_locked_idx` ON `flashcards` (`deck_id`,`locked`);--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`review_unit_id` text NOT NULL,
	`rating` integer NOT NULL,
	`state` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` real NOT NULL,
	`last_elapsed_days` real NOT NULL,
	`scheduled_days` real NOT NULL,
	`learning_steps` integer NOT NULL,
	`review` integer NOT NULL,
	FOREIGN KEY (`review_unit_id`) REFERENCES `review_units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_units` (
	`id` text PRIMARY KEY NOT NULL,
	`flashcard_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`sub_key` text DEFAULT '' NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`due` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` real DEFAULT 0 NOT NULL,
	`scheduled_days` real DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`locked` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`flashcard_id`) REFERENCES `flashcards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_units_deck_id_idx` ON `review_units` (`deck_id`);--> statement-breakpoint
CREATE INDEX `review_units_flashcard_id_idx` ON `review_units` (`flashcard_id`);--> statement-breakpoint
CREATE INDEX `review_units_deck_created_idx` ON `review_units` (`deck_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_units_deck_due_idx` ON `review_units` (`deck_id`,`due`);--> statement-breakpoint
CREATE INDEX `review_units_deck_state_idx` ON `review_units` (`deck_id`,`state`);--> statement-breakpoint
CREATE INDEX `review_units_deck_locked_idx` ON `review_units` (`deck_id`,`locked`);--> statement-breakpoint
CREATE INDEX `review_units_deck_archived_idx` ON `review_units` (`deck_id`,`archived`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`request_retention` real DEFAULT 0.9 NOT NULL,
	`maximum_interval` integer DEFAULT 36500 NOT NULL,
	`enable_fuzz` integer DEFAULT true NOT NULL,
	`enable_short_term` integer DEFAULT true NOT NULL,
	`learning_steps` text DEFAULT '10m' NOT NULL,
	`relearning_steps` text DEFAULT '10m' NOT NULL,
	`weights` text,
	`prereq_stability_floor` real DEFAULT 2 NOT NULL,
	`new_review_units_per_day` integer DEFAULT 10 NOT NULL,
	`keep_sibling_review_units_together` integer DEFAULT true NOT NULL,
	`scheduling_preset` text DEFAULT 'balanced' NOT NULL,
	`keybindings` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);