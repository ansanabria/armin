DELETE FROM `flashcard_prereqs`
WHERE EXISTS (
  SELECT 1
  FROM `flashcards` `prereq`, `flashcards` `dependent`
  WHERE `prereq`.`id` = `flashcard_prereqs`.`prereq_id`
    AND `dependent`.`id` = `flashcard_prereqs`.`dependent_id`
    AND `prereq`.`deck_id` <> `dependent`.`deck_id`
);
