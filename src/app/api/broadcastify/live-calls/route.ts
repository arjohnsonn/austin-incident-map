import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { generateBroadcastifyJWT, authenticateUser } from '@/lib/broadcastify-jwt';
import { parseDispatchCallWithAI } from '@/lib/dispatch-parser';
import { BroadcastifyLiveResponse, DispatchIncident } from '@/types/broadcastify';

const BROADCASTIFY_LIVE_ENDPOINT = 'https://api.bcfy.io/calls/v1/live/';
const GROUP_ID = '2-1147';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    ),
  ]);
}

async function geocodeWithNominatim(query: string): Promise<[number, number] | null> {
  try {
    const response = await withTimeout(
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`,
        {
          headers: {
            'User-Agent': 'Austin-Fire-Map/1.0',
          },
        }
      ),
      5000
    );

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
  try {
    const response = await withTimeout(
      fetch(
        `https://geocode.maps.co/search?q=${encodeURIComponent(query)}&api_key=${apiKey}`
      ),
      5000
    );

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

async function geocodeAddress(addressVariants: string[]): Promise<[number, number] | null> {
  console.log(`Trying ${addressVariants.length} address variants with fallback geocoding`);

  const mapsCoKey1 = process.env.GEOCODING_API_KEY;
  const mapsCoKey2 = process.env.GEOCODING_API_KEY_2;

  for (const query of addressVariants) {
    console.log(`Trying: "${query}"`);

    const nominatimResult = await geocodeWithNominatim(query);
    if (nominatimResult) {
      return nominatimResult;
    }

    if (mapsCoKey1) {
      const mapsCoResult1 = await geocodeWithMapsCo(query, mapsCoKey1, 'Key 1');
      if (mapsCoResult1) {
        return mapsCoResult1;
      }
    }

    if (mapsCoKey2) {
      const mapsCoResult2 = await geocodeWithMapsCo(query, mapsCoKey2, 'Key 2');
      if (mapsCoResult2) {
        return mapsCoResult2;
      }
    }
  }

  console.log(`❌ All geocoding attempts failed for all variants`);
  return null;
}

async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('\n=== BROADCASTIFY LIVE CALLS API START ===');
    const searchParams = request.nextUrl.searchParams;
    const pos = searchParams.get('pos');
    const init = searchParams.get('init');
    console.log('Request params - pos:', pos, 'init:', init);

    const auth = await authenticateUser();
    const jwt = generateBroadcastifyJWT(auth.uid, auth.token);

    let url = `${BROADCASTIFY_LIVE_ENDPOINT}?groups=${GROUP_ID}`;
    if (init === '1') {
      url += '&init=1';
    } else if (pos) {
      url += `&pos=${pos}`;
    }

    console.log('Fetching live calls from:', url);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    console.log('Broadcastify response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Broadcastify error response:', errorText);
      throw new Error(`Broadcastify API error: ${response.statusText}`);
    }

    const data: BroadcastifyLiveResponse = await response.json();

    console.log('\n=== RAW BROADCASTIFY RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== END RAW RESPONSE ===\n');

    console.log('Broadcastify response data:');
    console.log('  serverTime:', data.serverTime, new Date(data.serverTime * 1000).toISOString());
    console.log('  lastPos:', data.lastPos, new Date(data.lastPos * 1000).toISOString());
    console.log('  calls count:', data.calls.length);

    if (data.calls.length > 0) {
      console.log('\nCalls received:');
      data.calls.forEach((call, idx) => {
        console.log(`  [${idx + 1}]`, {
          groupId: call.groupId,
          ts: call.ts,
          timestamp: new Date(call.ts * 1000).toISOString(),
          duration: call.duration,
          url: call.url,
          descr: call.descr,
        });
      });
    } else {
      console.log('  No new calls received');
    }

    async function processCall(call: any): Promise<DispatchIncident | null> {
      try {
        console.log(`\n--- Processing call ${call.ts} ---`);
        console.log('Downloading audio from:', call.url);

        const transcript = await transcribeAudio(call.url);
        console.log('Raw transcription from Whisper:', transcript);

        const parsed = await parseDispatchCallWithAI(transcript);

        if (!parsed.address) {
          console.log('❌ Skipping - missing address');
          return null;
        }

        const finalCallType = parsed.callType || '?';

        console.log('Geocoding address with variants:', parsed.addressVariants);
        const coordinates = await geocodeAddress(parsed.addressVariants);
        console.log('Coordinates:', coordinates);

        const incident: DispatchIncident = {
          id: `${call.groupId}-${call.ts}-${call.start_ts}`,
          callType: finalCallType,
          units: parsed.units,
          channels: parsed.channels,
          address: parsed.address,
          location: coordinates ? {
            type: 'Point',
            coordinates,
          } : undefined as any,
          timestamp: new Date(call.ts * 1000),
          audioUrl: call.url,
          rawTranscript: transcript,
          groupId: call.groupId,
          duration: call.duration,
          estimatedResolutionMinutes: parsed.estimatedResolutionMinutes,
          incidentType: parsed.incidentType,
        };

        if (coordinates) {
          console.log('✓ Successfully processed incident with coordinates:', incident.id);
        } else {
          console.log('⚠️ Processed incident WITHOUT coordinates (will show in list only):', incident.id);
        }

        return incident;
      } catch (error) {
        console.error(`❌ Error processing call ${call.ts}:`, error);
        return null;
      }
    }

    const BATCH_SIZE = 25;
    const processedIncidents: DispatchIncident[] = [];

    for (let i = 0; i < data.calls.length; i += BATCH_SIZE) {
      const batch = data.calls.slice(i, i + BATCH_SIZE);
      console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (calls ${i + 1}-${Math.min(i + BATCH_SIZE, data.calls.length)})`);

      const results = await Promise.all(batch.map(call => processCall(call)));
      const validIncidents = results.filter((incident): incident is DispatchIncident => incident !== null);
      processedIncidents.push(...validIncidents);

      console.log(`✓ Batch complete: ${validIncidents.length}/${batch.length} successful`);
    }

    console.log('\nRemoving reassigned units...');
    const sorted = [...processedIncidents].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const assignedUnits = new Set<string>();
    const finalIncidents: DispatchIncident[] = [];

    for (const incident of sorted) {
      if (!incident.units || incident.units.length === 0) {
        finalIncidents.push(incident);
        continue;
      }

      const availableUnits = incident.units.filter(unit => !assignedUnits.has(unit));

      if (availableUnits.length === 0) {
        console.log(`  → Removing incident ${incident.id} at ${incident.address} (all units reassigned to newer calls)`);
        continue;
      }

      if (availableUnits.length < incident.units.length) {
        const removedUnits = incident.units.filter(unit => assignedUnits.has(unit));
        console.log(`  → Removed units ${removedUnits.join(', ')} from ${incident.id} (reassigned to newer calls)`);
      }

      finalIncidents.push({
        ...incident,
        units: availableUnits,
      });

      availableUnits.forEach(unit => assignedUnits.add(unit));
    }
    console.log(`Unit reassignment: ${processedIncidents.length} → ${finalIncidents.length} incidents`);

    console.log('\nRemoving duplicate address+callType combinations...');

    const normalizeCallType = (callType: string) => {
      return callType.toLowerCase().replace(/[^a-z0-9]/g, '');
    };

    const seenByCallType = new Map<string, DispatchIncident[]>();
    const deduplicated: DispatchIncident[] = [];

    for (const incident of finalIncidents) {
      const normalizedCallType = normalizeCallType(incident.callType);

      if (!seenByCallType.has(normalizedCallType)) {
        seenByCallType.set(normalizedCallType, []);
      }
      seenByCallType.get(normalizedCallType)!.push(incident);
    }

    for (const [callType, incidents] of seenByCallType.entries()) {
      const incidentsWithAddress = incidents.filter(inc => inc.address && inc.address !== '?');
      const incidentsWithoutAddress = incidents.filter(inc => !inc.address || inc.address === '?');

      const grouped = new Map<string, DispatchIncident[]>();

      for (const incident of incidentsWithAddress) {
        const normalizedAddress = incident.address.trim().toLowerCase();
        if (!grouped.has(normalizedAddress)) {
          grouped.set(normalizedAddress, []);
        }
        grouped.get(normalizedAddress)!.push(incident);
      }

      for (const [address, addressIncidents] of grouped.entries()) {
        const sorted = addressIncidents.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const newest = sorted[0];
        deduplicated.push(newest);

        if (sorted.length > 1) {
          console.log(`  → Keeping newest of ${sorted.length} incidents at ${address}: ${newest.id}`);
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
            console.log(`  → Removing incident ${incident.id} with no address and no units`);
            continue;
          }

          const hasUniqueUnits = incident.units.some(unit => !allUnitsInAddressedIncidents.has(unit));

          if (hasUniqueUnits) {
            deduplicated.push(incident);
          } else {
            console.log(`  → Removing incident ${incident.id} with no address - all units are in addressed incidents`);
          }
        }
      }
    }
    console.log(`Address+CallType deduplication: ${finalIncidents.length} → ${deduplicated.length} incidents`);

    const skippedCount = data.calls.length - processedIncidents.length;
    const reassignedCount = processedIncidents.length - finalIncidents.length;
    const duplicateCount = finalIncidents.length - deduplicated.length;

    console.log('\n=== SUMMARY ===');
    console.log('Total calls received:', data.calls.length);
    console.log('Skipped (no address/errors):', skippedCount);
    console.log('After processing:', processedIncidents.length);
    console.log('Units reassigned (incidents removed):', reassignedCount);
    console.log('Duplicate address+callType removed:', duplicateCount);
    console.log('Final incidents:', deduplicated.length);
    console.log('  - With coordinates:', deduplicated.filter(i => i.location).length);
    console.log('  - Without coordinates:', deduplicated.filter(i => !i.location).length);
    console.log('=== BROADCASTIFY LIVE CALLS API END ===\n');

    return NextResponse.json({
      incidents: deduplicated,
      lastPos: data.lastPos,
      serverTime: data.serverTime,
    });
  } catch (error) {
    console.error('Live calls API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live calls' },
      { status: 500 }
    );
  }
}
