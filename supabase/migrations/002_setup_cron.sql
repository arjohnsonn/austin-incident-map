-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Note: Cron job setup requires manual configuration in Supabase SQL Editor
-- because we need the service role key which shouldn't be in migrations.
-- Run this SQL in your Supabase SQL Editor after deployment:
--
-- SELECT cron.schedule(
--   'process-broadcastify-calls',
--   '* * * * *',  -- Every minute
--   $$
--   SELECT
--     net.http_post(
--       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-calls',
--       headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY_HERE"}'::jsonb
--     ) AS request_id;
--   $$
-- );

-- View all scheduled cron jobs
-- Run this to verify your cron job is set up:
-- SELECT * FROM cron.job;

-- To unschedule the job (if needed):
-- SELECT cron.unschedule('process-broadcastify-calls');
