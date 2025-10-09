import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SupabaseIncident {
  id: string;
  call_type: string;
  address: string;
  location: string | null;
  units: string[];
  channels: string[];
  timestamp: string;
  audio_url: string | null;
  raw_transcript: string | null;
  estimated_resolution_minutes: number | null;
  incident_type: 'fire' | 'medical' | 'traffic';
  group_id: string;
  duration: number | null;
  external_id: string;
  created_at: string;
}
