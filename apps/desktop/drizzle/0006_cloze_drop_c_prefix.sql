-- Cloze syntax moved from Anki-style `{{cN::answer}}` to `{{N::answer}}`:
-- the cluster number is now optional and auto-assigned, so the mandatory `cN`
-- prefix is gone. Existing cloze notes keep their explicit numbers (and thus
-- their generated cards' sub_keys / FSRS history) by dropping just the `c`.
-- In old cloze content every `{{` opener is followed by `c<digit>`, so this
-- only rewrites deletion markers.
UPDATE `notes` SET `content` = REPLACE(`content`, '{{c', '{{') WHERE `type` = 'cloze';
