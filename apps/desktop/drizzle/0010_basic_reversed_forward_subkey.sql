UPDATE `review_units`
SET `sub_key` = ''
WHERE `sub_key` = 'fwd'
  AND `flashcard_id` IN (
    SELECT `id` FROM `flashcards` WHERE `type` = 'basic_reversed'
  );
