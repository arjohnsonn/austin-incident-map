import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateBroadcastifyJWT, authenticateUser } from '../_shared/broadcastify-jwt.ts';
import { parseDispatchCallWithAI, quickEstimateResolution } from '../_shared/dispatch-parser.ts';

const BROADCASTIFY_LIVE_ENDPOINT = 'https://api.bcfy.io/calls/v1/live/';
const GROUP_ID = '2-1147';

interface BroadcastifyCall {
  groupId: string;
  ts: number;
  start_ts: number;
  url: string;
  descr?: string;
  duration: number;
}

interface BroadcastifyLiveResponse {
  serverTime: number;
  lastPos: number;
  calls: BroadcastifyCall[];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    ),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class RateLimiter {
  private lastRequest = 0;
  private queue: Array<{ resolve: () => void; minIntervalMs: number }> = [];
  private processing = false;

  async acquire(minIntervalMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ resolve, minIntervalMs });
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequest;
      const waitTime = Math.max(0, item.minIntervalMs - timeSinceLastRequest);

      if (waitTime > 0) {
        await delay(waitTime);
      }

      this.lastRequest = Date.now();
      item.resolve();
    }

    this.processing = false;
  }
}

const rateLimiters = {
  nominatim: new RateLimiter(),
  mapsCoKey1: new RateLimiter(),
  mapsCoKey2: new RateLimiter(),
};

async function geocodeWithNominatim(query: string): Promise<[number, number] | null> {
  await rateLimiters.nominatim.acquire(1000);

  try {
    const viewbox = '-98.2,30.0,-97.4,30.6';
    const response = await withTimeout(
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us&viewbox=${viewbox}&bounded=1`,
        {
          headers: {
            'User-Agent': 'Austin-Fire-Map/1.0',
          },
        }
      ),
      5000
    );

    if (!response.ok) {
      console.log(`Nominatim HTTP ${response.status} for "${query}"`);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      console.log(`✓ Nominatim geocoding successful: [${result.lon}, ${result.lat}]`);
      return [parseFloat(result.lon), parseFloat(result.lat)] as [number, number];
    }
  } catch (error) {
    console.log(`Nominatim failed for "${query}":`, error instanceof Error ? error.message : 'Unknown error');
  }
  return null;
}

async function geocodeWithMapsCo(query: string, apiKey: string, keyName: string): Promise<[number, number] | null> {
  const limiter = keyName === 'Key 1' ? rateLimiters.mapsCoKey1 : rateLimiters.mapsCoKey2;
  await limiter.acquire(1000);

  try {
    const queryWithLocation = `${query}, Austin, Travis County, Texas`;
    const response = await withTimeout(
      fetch(
        `https://geocode.maps.co/search?q=${encodeURIComponent(queryWithLocation)}&api_key=${apiKey}`
      ),
      5000
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`Maps.co (${keyName}) rate limited (429) for "${query}"`);
      } else {
        console.log(`Maps.co (${keyName}) HTTP ${response.status} for "${query}"`);
      }
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      console.log(`✓ Maps.co (${keyName}) geocoding successful: [${result.lon}, ${result.lat}]`);
      return [parseFloat(result.lon), parseFloat(result.lat)] as [number, number];
    }
  } catch (error) {
    console.log(`Maps.co (${keyName}) failed for "${query}":`, error instanceof Error ? error.message : 'Unknown error');
  }
  return null;
}

function isWithinAustinArea(coordinates: [number, number]): boolean {
  const [lon, lat] = coordinates;

  const bounds = {
    north: 30.6,
    south: 30.0,
    west: -98.2,
    east: -97.4
  };

  const isInBounds = lat >= bounds.south && lat <= bounds.north &&
                     lon >= bounds.west && lon <= bounds.east;

  if (!isInBounds) {
    console.log(`⚠️ Coordinates [${lon}, ${lat}] are outside Austin/Travis County area`);
  }

  return isInBounds;
}

async function geocodeAddress(addressVariants: string[]): Promise<[number, number] | null> {
  console.log(`Trying ${addressVariants.length} address variants with fallback geocoding`);

  const mapsCoKey1 = Deno.env.get('GEOCODING_API_KEY');
  const mapsCoKey2 = Deno.env.get('GEOCODING_API_KEY_2');

  for (const query of addressVariants) {
    console.log(`Trying: "${query}"`);

    const nominatimResult = await geocodeWithNominatim(query);
    if (nominatimResult && isWithinAustinArea(nominatimResult)) {
      return nominatimResult;
    }

    if (mapsCoKey1) {
      const mapsCoResult1 = await geocodeWithMapsCo(query, mapsCoKey1, 'Key 1');
      if (mapsCoResult1 && isWithinAustinArea(mapsCoResult1)) {
        return mapsCoResult1;
      }
    }

    if (mapsCoKey2) {
      const mapsCoResult2 = await geocodeWithMapsCo(query, mapsCoKey2, 'Key 2');
      if (mapsCoResult2 && isWithinAustinArea(mapsCoResult2)) {
        return mapsCoResult2;
      }
    }
  }

  console.log(`❌ All geocoding attempts failed for all variants (or results outside Austin area)`);
  return null;
}

async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!deepgramApiKey) {
      throw new Error('DEEPGRAM_API_KEY not configured');
    }

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en-US', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    });

    if (!response.ok) {
      throw new Error(`Deepgram transcription failed: ${response.statusText}`);
    }

    const result = await response.json();
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    if (!transcript) {
      throw new Error('No transcript returned from Deepgram');
    }

    return transcript;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

Deno.serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('\n=== BROADCASTIFY WORKER START ===');

    const { data: stateData, error: stateError } = await supabase
      .from('worker_state')
      .select('value')
      .eq('key', 'lastPos')
      .single();

    if (stateError) {
      console.error('Error fetching lastPos:', stateError);
      return new Response(JSON.stringify({ error: 'Failed to fetch worker state' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const lastPos = parseInt(stateData.value, 10);
    console.log('Current lastPos:', lastPos, new Date(lastPos * 1000).toISOString());

    const auth = await authenticateUser();
    const jwt = await generateBroadcastifyJWT(auth.uid, auth.token);

    const isFirstRun = lastPos === 0;
    const url = isFirstRun
      ? `${BROADCASTIFY_LIVE_ENDPOINT}?groups=${GROUP_ID}&init=1`
      : `${BROADCASTIFY_LIVE_ENDPOINT}?groups=${GROUP_ID}&pos=${lastPos}`;

    console.log(isFirstRun ? '🔄 INITIAL RUN - Fetching last 25 calls with init=1' : '📡 Incremental update with pos parameter');
    console.log('Fetching live calls from:', url);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Broadcastify error response:', errorText);
      throw new Error(`Broadcastify API error: ${response.statusText}`);
    }

    const data: BroadcastifyLiveResponse = await response.json();
    console.log('Calls count:', data.calls.length);
    console.log('New lastPos:', data.lastPos);

    await supabase
      .from('worker_state')
      .update({ value: data.lastPos.toString(), updated_at: new Date().toISOString() })
      .eq('key', 'lastPos');

    if (data.calls.length === 0) {
      console.log('No new calls');
      return new Response(JSON.stringify({ processed: 0, skipped: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('\n=== PRIORITY SORTING ===');
    const callsWithPriority = data.calls.map((call) => {
      const estimatedResolution = quickEstimateResolution(call.descr || '');
      const age = (Date.now() - call.ts * 1000) / (1000 * 60);
      const willShowInDynamicFilter = age < estimatedResolution;

      console.log(`  Call ${call.ts}: "${call.descr}" → ${estimatedResolution}min estimate, ${age.toFixed(1)}min old, ${willShowInDynamicFilter ? 'PRIORITY' : 'standard'}`);

      return {
        call,
        estimatedResolution,
        priority: willShowInDynamicFilter ? 1 : 2,
      };
    });

    callsWithPriority.sort((a, b) => a.priority - b.priority || b.call.ts - a.call.ts);

    console.log('\n=== PROCESSING IN BATCHES ===');

    interface ProcessedIncident {
      call_type: string;
      address: string;
      location: string | null;
      units: string[];
      channels: string[];
      timestamp: string;
      audio_url: string;
      raw_transcript: string;
      estimated_resolution_minutes: number | null;
      incident_type: 'fire' | 'medical' | 'traffic';
      group_id: string;
      duration: number;
      external_id: string;
    }

    const processedIncidents: ProcessedIncident[] = [];
    const BATCH_SIZE = 20;

    for (let i = 0; i < callsWithPriority.length; i += BATCH_SIZE) {
      const batch = callsWithPriority.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(callsWithPriority.length / BATCH_SIZE);

      console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} calls)`);

      const batchResults = await Promise.all(
        batch.map(async ({ call }) => {
          try {
            console.log(`  Transcribing call ${call.ts}...`);

            const externalId = `${call.groupId}-${call.ts}-${call.start_ts}`;

            const { data: existingIncident } = await supabase
              .from('incidents')
              .select('id')
              .eq('external_id', externalId)
              .single();

            if (existingIncident) {
              console.log(`  → Incident ${externalId} already exists, skipping`);
              return null;
            }

            const transcript = await transcribeAudio(call.url);
            console.log(`  ✓ Transcribed ${call.ts}: "${transcript.substring(0, 60)}..."`);

            const parsed = await parseDispatchCallWithAI(transcript);
            const finalCallType = parsed.callType || '?';

            let coordinates: [number, number] | null = null;
            if (parsed.address && parsed.addressVariants.length > 0) {
              coordinates = await geocodeAddress(parsed.addressVariants);
            }

            const incident: ProcessedIncident = {
              call_type: finalCallType,
              address: parsed.address || '?',
              location: coordinates ? `POINT(${coordinates[0]} ${coordinates[1]})` : null,
              units: parsed.units,
              channels: parsed.channels,
              timestamp: new Date(call.ts * 1000).toISOString(),
              audio_url: call.url,
              raw_transcript: transcript,
              estimated_resolution_minutes: parsed.estimatedResolutionMinutes,
              incident_type: parsed.incidentType,
              group_id: call.groupId,
              duration: call.duration,
              external_id: externalId,
            };

            console.log(`  ✓ Processed incident ${externalId}`);
            return incident;
          } catch (error) {
            console.error(`  ✗ Error processing call ${call.ts}:`, error);
            return null;
          }
        })
      );

      for (const incident of batchResults) {
        if (incident) {
          processedIncidents.push(incident);
        }
      }

      console.log(`✓ Batch ${batchNum} complete: ${batchResults.filter(i => i !== null).length}/${batch.length} successful`);
    }

    console.log(`\n=== DEDUPLICATION ===`);
    console.log('Total processed incidents:', processedIncidents.length);

    const sorted = [...processedIncidents].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const assignedUnits = new Set<string>();
    const afterUnitReassignment: ProcessedIncident[] = [];

    for (const incident of sorted) {
      if (!incident.units || incident.units.length === 0) {
        afterUnitReassignment.push(incident);
        continue;
      }

      const availableUnits = incident.units.filter(unit => !assignedUnits.has(unit));

      if (availableUnits.length === 0) {
        console.log(`  → Removing incident ${incident.external_id} at ${incident.address} (all units reassigned)`);
        continue;
      }

      afterUnitReassignment.push({
        ...incident,
        units: availableUnits,
      });

      availableUnits.forEach(unit => assignedUnits.add(unit));
    }

    console.log(`After unit reassignment: ${processedIncidents.length} → ${afterUnitReassignment.length} incidents`);

    const normalizeCallType = (callType: string) => {
      return callType.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const normalizeAddressForDedup = (addr: string): string => {
      if (!addr || addr === '?') return '';
      return addr
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
    };

    const seenByCallType = new Map<string, ProcessedIncident[]>();
    const deduplicated: ProcessedIncident[] = [];

    for (const incident of afterUnitReassignment) {
      const normalizedCallType = normalizeCallType(incident.call_type);

      if (!seenByCallType.has(normalizedCallType)) {
        seenByCallType.set(normalizedCallType, []);
      }
      seenByCallType.get(normalizedCallType)!.push(incident);
    }

    for (const [, incidents] of seenByCallType.entries()) {
      const incidentsWithAddress = incidents.filter(inc => inc.address && inc.address !== '?');
      const incidentsWithoutAddress = incidents.filter(inc => !inc.address || inc.address === '?');

      const grouped = new Map<string, ProcessedIncident[]>();

      for (const incident of incidentsWithAddress) {
        const normalizedAddress = normalizeAddressForDedup(incident.address);
        if (!grouped.has(normalizedAddress)) {
          grouped.set(normalizedAddress, []);
        }
        grouped.get(normalizedAddress)!.push(incident);
      }

      for (const [address, addressIncidents] of grouped.entries()) {
        const sortedByTime = addressIncidents.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        deduplicated.push(sortedByTime[0]);

        if (sortedByTime.length > 1) {
          console.log(`  → Keeping newest of ${sortedByTime.length} incidents at address ${address}`);
        }
      }

      if (incidentsWithoutAddress.length > 0) {
        const allUnitsInAddressedIncidents = new Set<string>();
        for (const incident of incidentsWithAddress) {
          if (incident.units) {
            incident.units.forEach(unit => allUnitsInAddressedIncidents.add(unit));
          }
        }

        for (const incident of incidentsWithoutAddress) {
          if (!incident.units || incident.units.length === 0) {
            console.log(`  → Removing incident ${incident.external_id} with no address and no units`);
            continue;
          }

          const hasUniqueUnits = incident.units.some(unit => !allUnitsInAddressedIncidents.has(unit));

          if (hasUniqueUnits) {
            deduplicated.push(incident);
          } else {
            console.log(`  → Removing incident ${incident.external_id} with no address (all units in addressed incidents)`);
          }
        }
      }
    }

    console.log(`After address+callType deduplication: ${afterUnitReassignment.length} → ${deduplicated.length} incidents`);

    console.log('\n=== MERGING RELATED INCIDENTS ===');
    const TIME_WINDOW_MS = 5 * 60 * 1000;

    const normalizeAddress = (addr: string): string => {
      if (!addr || addr === '?') return '';
      return addr
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
    };

    const addressesSimilar = (addr1: string, addr2: string): boolean => {
      if (!addr1 || !addr2 || addr1 === '?' || addr2 === '?') return false;

      const norm1 = normalizeAddress(addr1);
      const norm2 = normalizeAddress(addr2);

      if (norm1 === norm2) return true;
      if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

      const extractNumbers = (s: string) => s.match(/\d+/g) || [];
      const nums1 = extractNumbers(norm1);
      const nums2 = extractNumbers(norm2);

      if (nums1.length > 0 && nums2.length > 0 && nums1[0] === nums2[0]) {
        const baseAddr1 = norm1.replace(/^\d+/, '');
        const baseAddr2 = norm2.replace(/^\d+/, '');

        if (baseAddr1.includes(baseAddr2) || baseAddr2.includes(baseAddr1)) return true;
        if (baseAddr1 === baseAddr2) return true;
      }

      const extractMainStreet = (s: string) => {
        const lower = s.toLowerCase();
        const words = lower.match(/\b[a-z]+\b/g) || [];
        const mainWords = words.slice(0, 2);
        return mainWords.join('');
      };

      const mainStreet1 = extractMainStreet(addr1);
      const mainStreet2 = extractMainStreet(addr2);

      if (mainStreet1.length >= 6 && mainStreet2.length >= 6 && mainStreet1 === mainStreet2) {
        return true;
      }

      return false;
    };

    for (let i = 0; i < deduplicated.length; i++) {
      const incident = deduplicated[i];
      const hasCoordinates = !!incident.location;

      for (let j = i + 1; j < deduplicated.length; j++) {
        const other = deduplicated[j];
        const otherHasCoordinates = !!other.location;

        const timeDiff = Math.abs(
          new Date(incident.timestamp).getTime() - new Date(other.timestamp).getTime()
        );

        if (timeDiff > TIME_WINDOW_MS) continue;

        const hasOverlappingUnits = incident.units && other.units &&
          incident.units.some(unit => other.units?.includes(unit));

        const similarAddresses = addressesSimilar(incident.address, other.address);

        const shouldMerge = (timeDiff < 120000 && hasOverlappingUnits) ||
                           (timeDiff < 60000 && similarAddresses);

        if (!shouldMerge) continue;

        let targetIncident = incident;
        let sourceIncident = other;
        let sourceIndex = j;

        if (otherHasCoordinates && !hasCoordinates) {
          targetIncident = other;
          sourceIncident = incident;
          sourceIndex = i;
        }

        if (!targetIncident.call_type || targetIncident.call_type === '?' || targetIncident.call_type === '-') {
          if (sourceIncident.call_type && sourceIncident.call_type !== '?' && sourceIncident.call_type !== '-') {
            console.log(`  → Merging callType "${sourceIncident.call_type}" from ${sourceIncident.external_id} into ${targetIncident.external_id}`);
            targetIncident.call_type = sourceIncident.call_type;
          }
        }

        if (!targetIncident.address || targetIncident.address === '?') {
          if (sourceIncident.address && sourceIncident.address !== '?') {
            console.log(`  → Merging address "${sourceIncident.address}" from ${sourceIncident.external_id} into ${targetIncident.external_id}`);
            targetIncident.address = sourceIncident.address;
          }
        }

        if (!targetIncident.location && sourceIncident.location) {
          console.log(`  → Merging coordinates from ${sourceIncident.external_id} into ${targetIncident.external_id}`);
          targetIncident.location = sourceIncident.location;
        }

        if (!targetIncident.units || targetIncident.units.length === 0) {
          if (sourceIncident.units && sourceIncident.units.length > 0) {
            targetIncident.units = sourceIncident.units;
          }
        } else if (sourceIncident.units && sourceIncident.units.length > 0) {
          const combinedUnits = [...new Set([...targetIncident.units, ...sourceIncident.units])];
          targetIncident.units = combinedUnits;
        }

        console.log(`  → Removing duplicate incident ${sourceIncident.external_id}`);
        deduplicated.splice(sourceIndex, 1);

        if (sourceIndex < i) {
          i--;
        }
        j--;
      }
    }

    console.log(`After merging related incidents: ${deduplicated.length} incidents`);

    console.log('\n=== INSERTING INTO DATABASE ===');
    let completed = 0;
    let skipped = 0;

    for (const incident of deduplicated) {
      try {
        const { error: insertError } = await supabase
          .from('incidents')
          .insert([incident]);

        if (insertError) {
          console.error(`  ✗ Error inserting incident ${incident.external_id}:`, insertError);
          skipped++;
        } else {
          console.log(`  ✓ Inserted incident ${incident.external_id}`);
          completed++;
        }
      } catch (error) {
        console.error(`  ✗ Error inserting incident ${incident.external_id}:`, error);
        skipped++;
      }
    }

    console.log('\n=== WORKER COMPLETE ===');
    console.log('Total processed:', processedIncidents.length);
    console.log('After deduplication:', deduplicated.length);
    console.log('Successfully inserted:', completed);
    console.log('Failed:', skipped);

    return new Response(JSON.stringify({ processed: completed, skipped }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
