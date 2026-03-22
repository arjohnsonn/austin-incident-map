CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  notify_all_calls BOOLEAN DEFAULT true,
  notify_call_types TEXT[] DEFAULT '{}',
  notify_units TEXT[] DEFAULT '{}',
  notify_incident_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- All access goes through API routes using the service role key (bypasses RLS).
-- Deny all anonymous/authenticated direct access.
CREATE POLICY "Deny anonymous access" ON push_subscriptions
  FOR ALL USING (false);
