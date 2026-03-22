import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webPush.setVapidDetails('mailto:admin@austinfdlive.com', pub, priv);
  vapidConfigured = true;
  return true;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  notify_all_calls: boolean;
  notify_call_types: string[];
  notify_units: string[];
  notify_incident_types: string[];
}

interface IncidentPayload {
  call_type: string;
  address: string;
  location: string | null;
  units: string[];
  incident_type: string | null;
  external_id: string;
  audio_url?: string;
}

function subscriptionMatchesIncident(sub: PushSubscriptionRow, incident: IncidentPayload): boolean {
  if (sub.notify_all_calls) return true;

  if (sub.notify_incident_types.length > 0 && incident.incident_type) {
    if (sub.notify_incident_types.includes(incident.incident_type)) return true;
  }

  if (sub.notify_call_types.length > 0 && incident.call_type) {
    const matches = sub.notify_call_types.some((ct) =>
      incident.call_type.toLowerCase().includes(ct.toLowerCase())
    );
    if (matches) return true;
  }

  if (sub.notify_units.length > 0 && incident.units?.length > 0) {
    const matches = incident.units.some((unit) =>
      sub.notify_units.some((nu) =>
        unit.toLowerCase().includes(nu.toLowerCase())
      )
    );
    if (matches) return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  if (!ensureVapid()) {
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const incident: IncidentPayload = await request.json();

    if (!incident.location) {
      return NextResponse.json({ sent: 0, skipped: 'not geocoded' });
    }

    const isIncomplete =
      (!incident.call_type || incident.call_type === '?' || incident.call_type === 'Nondeterminate' || incident.call_type.trim() === '') &&
      (!incident.units || incident.units.length === 0);

    if (isIncomplete) {
      return NextResponse.json({ sent: 0, skipped: 'incomplete incident' });
    }

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (error || !subscriptions) {
      console.error('Failed to fetch subscriptions:', error);
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
    }

    const callType = incident.call_type && incident.call_type !== '?' && incident.call_type !== 'Nondeterminate'
      ? incident.call_type : null;
    const address = incident.address && incident.address !== '?' ? incident.address : null;
    const units = incident.units?.length ? incident.units.join(', ') : null;

    const title = callType || 'New Incident';
    const body = [address, units ? `Units: ${units}` : null]
      .filter(Boolean)
      .join('\n');

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: incident.external_id,
      data: { incidentId: incident.external_id },
    });

    const matching = (subscriptions as PushSubscriptionRow[]).filter((sub) =>
      subscriptionMatchesIncident(sub, incident)
    );

    const results = await Promise.allSettled(
      matching.map(async (sub) => {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          payload
        );
        return sub.endpoint;
      })
    );

    const staleEndpoints: string[] = [];
    let sent = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        const statusCode = (result.reason as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          const index = results.indexOf(result);
          staleEndpoints.push(matching[index].endpoint);
        }
      }
    }

    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints);
    }

    return NextResponse.json({ sent, cleaned: staleEndpoints.length });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
