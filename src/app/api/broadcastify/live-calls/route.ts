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

function preprocessAddress(address: string): string[] {
  let cleaned = address;

  console.log(`Preprocessing address: "${address}"`);

  cleaned = cleaned.replace(/\b(Southbound|Northbound|Eastbound|Westbound)\b/gi, '');

  cleaned = cleaned.replace(/\bSouth Interstate Highway 35\b/gi, 'I-35 South');
  cleaned = cleaned.replace(/\bNorth Interstate Highway 35\b/gi, 'I-35 North');
  cleaned = cleaned.replace(/\bInterstate Highway 35\b/gi, 'I-35');

  const rangeMatch = cleaned.match(/(\d+)-\d+\s+(.+)/);
  if (rangeMatch) {
    cleaned = `${rangeMatch[1]} ${rangeMatch[2]}`;
    console.log(`  → Converted range to: "${cleaned}"`);
  }

  cleaned = cleaned.replace(/\s+to\s+.+?(Ramp|ramp)$/i, '');

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  console.log(`  → Final cleaned: "${cleaned}"`);

  const variations = [cleaned];

  if (cleaned.match(/\bI-35\b/i)) {
    const simplified = cleaned.replace(/\bI-35\s+(North|South)\b/gi, 'I-35');
    if (simplified !== cleaned) {
      variations.push(simplified);
    }
  }

  return variations;
}

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const addressVariations = preprocessAddress(address);

  for (const cleanedAddress of addressVariations) {
    const searchQueries = [
      `${cleanedAddress}, Austin, TX`,
      `${cleanedAddress}, Austin, Texas`,
      `${cleanedAddress}, Travis County, TX`,
    ];

    for (const query of searchQueries) {
      try {
        console.log(`Trying geocode query: ${query}`);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=us`,
          {
            headers: {
              'User-Agent': 'Austin-Fire-Map/1.0',
            },
          }
        );
        const data = await response.json();

        if (data && data.length > 0) {
          const result = data[0];
          console.log(`✓ Geocoding successful: [${result.lon}, ${result.lat}] - ${result.display_name}`);
          return [parseFloat(result.lon), parseFloat(result.lat)];
        }
      } catch (error) {
        console.error(`Geocoding error for query "${query}":`, error);
      }
    }
  }

  console.log(`❌ All geocoding attempts failed for: ${address}`);
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

        console.log('Geocoding address:', parsed.address);
        const coordinates = await geocodeAddress(parsed.address);
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

    const BATCH_SIZE = 15;
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

    const skippedCount = data.calls.length - processedIncidents.length;
    const reassignedCount = processedIncidents.length - finalIncidents.length;

    console.log('\n=== SUMMARY ===');
    console.log('Total calls received:', data.calls.length);
    console.log('Skipped (no address/errors):', skippedCount);
    console.log('After processing:', processedIncidents.length);
    console.log('Units reassigned (incidents removed):', reassignedCount);
    console.log('Final incidents:', finalIncidents.length);
    console.log('  - With coordinates:', finalIncidents.filter(i => i.location).length);
    console.log('  - Without coordinates:', finalIncidents.filter(i => !i.location).length);
    console.log('=== BROADCASTIFY LIVE CALLS API END ===\n');

    return NextResponse.json({
      incidents: finalIncidents,
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
