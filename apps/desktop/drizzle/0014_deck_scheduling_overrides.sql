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
