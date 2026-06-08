ALTER TABLE `cards` ADD `locked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `cards_deck_locked_idx` ON `cards` (`deck_id`,`locked`);--> statement-breakpoint
UPDATE `cards` SET `locked` = 0;--> statement-breakpoint
UPDATE `cards` SET `locked` = 1 WHERE `id` IN (
  SELECT DISTINCT cp.dependent_id
  FROM card_prereqs cp
  INNER JOIN cards p ON p.id = cp.prereq_id
  WHERE NOT (p.state = 2 AND p.stability >= 2.0)
);
