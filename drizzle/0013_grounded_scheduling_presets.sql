UPDATE `settings`
SET `learning_steps` = '10m'
WHERE `scheduling_preset` = 'balanced'
  AND `learning_steps` IN ('1m,10m', '1m, 10m');
