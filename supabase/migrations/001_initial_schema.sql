-- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type TEXT NOT NULL,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  units TEXT[] DEFAULT '{}',
  channels TEXT[] DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL,
  audio_url TEXT,
  raw_transcript TEXT,
  estimated_resolution_minutes INTEGER,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('fire', 'medical', 'traffic')),
  group_id TEXT NOT NULL,
  duration INTEGER,
  external_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_incident_type ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_external_id ON incidents (external_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents (created_at DESC);

-- Create spatial index for location queries
CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents USING GIST (location);

-- Create worker_state table to track position
CREATE TABLE IF NOT EXISTS worker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial lastPos value
INSERT INTO worker_state (key, value)
VALUES ('lastPos', '0')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_state ENABLE ROW LEVEL SECURITY;

-- Create policies for anon and authenticated users (read-only for clients)
CREATE POLICY "Allow public read access to incidents"
  ON incidents FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service role full access to incidents"
  ON incidents
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to worker_state"
  ON worker_state
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public read access to worker_state"
  ON worker_state FOR SELECT
  TO anon, authenticated
  USING (true);
