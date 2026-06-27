UPDATE flashcards
SET
  type = 'image_occlusion',
  content = json_object(
    'baseImage', json_extract(content, '$.image'),
    'masks', json(COALESCE((
      SELECT json_group_array(
        json_patch(
          json_patch(
            json_object(
              'id', COALESCE(json_extract(region.value, '$.id'), 'r' || (CAST(region.key AS integer) + 1)),
              'geometry', json_object(
                'x', COALESCE(json_extract(region.value, '$.x'), 0),
                'y', COALESCE(json_extract(region.value, '$.y'), 0),
                'w', COALESCE(json_extract(region.value, '$.w'), 0),
                'h', COALESCE(json_extract(region.value, '$.h'), 0)
              )
            ),
            CASE
              WHEN json_type(region.value, '$.label') = 'text'
                THEN json_object('label', json_extract(region.value, '$.label'))
              ELSE json_object()
            END
          ),
          CASE
            WHEN json_type(region.value, '$.hint') = 'text'
              THEN json_object('hint', json_extract(region.value, '$.hint'))
            ELSE json_object()
          END
        )
      )
      FROM json_each(content, '$.regions') AS region
    ), '[]')),
    'revealMode', 'hide_all'
  ),
  updated_at = unixepoch() * 1000
WHERE type = 'diagram';
