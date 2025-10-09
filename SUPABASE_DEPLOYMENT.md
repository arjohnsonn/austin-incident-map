# Supabase Deployment Guide

This guide walks you through deploying the 24/7 background worker to Supabase Edge Functions.

## Prerequisites

1. Supabase account (free tier is sufficient)
2. Supabase CLI installed: `npm install -g supabase`
3. Your API keys for:
   - Broadcastify
   - Deepgram
   - OpenAI
   - Maps.co (geocoding)

## Step 1: Link to Your Supabase Project

```bash
# Login to Supabase
supabase login

# Link to your existing project
supabase link --project-ref YOUR_PROJECT_REF
```

## Step 2: Run Database Migrations

Apply the database schema to create tables and enable extensions:

```bash
supabase db push
```

This will run:
- `001_initial_schema.sql` - Creates `incidents` and `worker_state` tables
- `002_setup_cron.sql` - Sets up pg_cron scheduler

**Note:** After running migrations, you need to manually update the cron job with your service role key. Run this SQL in your Supabase SQL Editor:

```sql
-- First, unschedule the existing job
SELECT cron.unschedule('process-broadcastify-calls');

-- Then reschedule with your actual service role key
SELECT cron.schedule(
  'process-broadcastify-calls',
  '60 seconds',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-calls',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY_HERE"}'::jsonb
    ) AS request_id;
  $$
);
```

Replace `YOUR_SERVICE_ROLE_KEY_HERE` with your actual service role key from the `.env.local` file.

## Step 3: Configure Edge Function Secrets

Set environment variables for the Edge Function:

```bash
supabase secrets set BROADCASTIFY_API_KEY_ID=your_key_id
supabase secrets set BROADCASTIFY_API_KEY_SECRET=your_key_secret
supabase secrets set BROADCASTIFY_APP_ID=your_app_id
supabase secrets set OPENAI_API_KEY=sk-your-openai-key
supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
supabase secrets set GEOCODING_API_KEY=your_mapsco_key
supabase secrets set GEOCODING_API_KEY_2=your_mapsco_key_2
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Step 4: Deploy Edge Function

```bash
supabase functions deploy process-calls
```

## Step 5: Enable Realtime (Optional but Recommended)

In your Supabase dashboard:

1. Go to **Database** → **Replication**
2. Enable replication for the `incidents` table
3. This allows the frontend to receive live updates via WebSocket

## Step 6: Test the Deployment

### Test the Edge Function Manually

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-calls' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY_HERE' \
  -H 'Content-Type: application/json'
```

### Verify Cron Job

Check if the cron job is running:

```sql
-- View all scheduled jobs
SELECT * FROM cron.job;

-- View recent job runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-broadcastify-calls')
ORDER BY start_time DESC
LIMIT 10;
```

### Check Incidents Table

```sql
SELECT COUNT(*) as incident_count FROM incidents;
SELECT * FROM incidents ORDER BY timestamp DESC LIMIT 10;
```

## Step 7: Deploy Next.js Frontend

Your Next.js app is already configured to use Supabase. Simply deploy it:

```bash
# Build locally to test
pnpm run build
pnpm start

# Or deploy to Vercel/Netlify/etc
```

## Monitoring & Debugging

### View Edge Function Logs

```bash
supabase functions logs process-calls --follow
```

Or in the Supabase Dashboard:
1. Go to **Edge Functions** → **process-calls**
2. Click on **Logs** tab

### Check Worker State

```sql
SELECT * FROM worker_state;
```

This shows the current `lastPos` value used to track Broadcastify API position.

### Pause the Worker

```sql
SELECT cron.unschedule('process-broadcastify-calls');
```

### Resume the Worker

Re-run the schedule command from Step 2.

## Cost Estimates (Free Tier)

- **Supabase Database**: Free tier includes 500 MB database, unlimited API requests
- **Edge Functions**: 500,000 invocations/month free
  - Running every 60 seconds = 1,440/day = 43,200/month (well within free tier)
- **Realtime**: 200 concurrent connections free
- **API calls**:
  - Deepgram: ~$0.0035/min of audio (~$5/month for moderate usage)
  - OpenAI: ~$0.15/1M tokens (gpt-4o-mini) (~$2/month)
  - Geocoding: Free with rate limits (Nominatim + Maps.co)

**Total estimated cost: $0/month for infrastructure, ~$7/month for API usage**

## Troubleshooting

### Edge Function failing with CORS errors
- Ensure `verify_jwt = false` in `supabase/config.toml` for the Edge Function

### No incidents showing up
- Check Edge Function logs for errors
- Verify cron job is running: `SELECT * FROM cron.job_run_details`
- Manually trigger the function to test

### Realtime not working
- Enable replication for `incidents` table in Supabase dashboard
- Check browser console for WebSocket connection errors

### "Rate limit exceeded" errors
- Adjust rate limiters in Edge Function code
- Consider adding more geocoding API keys

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│           Supabase Infrastructure               │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  pg_cron (runs every 60 seconds)         │  │
│  │              ↓                             │  │
│  │  Edge Function: process-calls            │  │
│  │    - Fetch from Broadcastify API         │  │
│  │    - Transcribe audio (Deepgram)         │  │
│  │    - Parse with OpenAI                   │  │
│  │    - Geocode addresses                   │  │
│  │    - Insert into incidents table         │  │
│  └──────────────────────────────────────────┘  │
│                      ↓                          │
│  ┌──────────────────────────────────────────┐  │
│  │  PostgreSQL Database                     │  │
│  │    - incidents table                     │  │
│  │    - worker_state table                  │  │
│  └──────────────────────────────────────────┘  │
│                      ↓                          │
│  ┌──────────────────────────────────────────┐  │
│  │  Realtime (WebSocket)                    │  │
│  │    - Pushes new incidents to clients     │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                      ↓
          ┌──────────────────────┐
          │  Next.js Frontend    │
          │  (Client-side only)  │
          └──────────────────────┘
```

## Next Steps

1. Deploy the frontend to a hosting provider (Vercel recommended)
2. Monitor Edge Function logs for the first few hours
3. Adjust cron schedule if needed (currently 60 seconds)
4. Consider adding alerting for failures (Supabase webhooks)

## Support

If you encounter issues:
1. Check Edge Function logs: `supabase functions logs process-calls`
2. Verify database schema: `SELECT * FROM incidents LIMIT 1`
3. Test Edge Function manually with curl
4. Check Supabase status page: https://status.supabase.com
