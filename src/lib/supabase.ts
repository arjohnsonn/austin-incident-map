import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient() {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase environment variables not configured');
      return null;
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }

  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not available');
    }
    return (client as any)[prop];
  }
});

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
