DROP POLICY IF EXISTS "Allow anonymous inserts" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow anonymous updates by endpoint" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow anonymous deletes by endpoint" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow service role full access" ON push_subscriptions;

CREATE POLICY "Deny anonymous access" ON push_subscriptions
  FOR ALL USING (false);
