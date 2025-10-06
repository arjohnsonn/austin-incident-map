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

async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', Austin, TX')}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'Austin-Fire-Map/1.0',
        },
      }
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
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
    console.log('Request params - pos:', pos);

    const auth = await authenticateUser();
    const jwt = generateBroadcastifyJWT(auth.uid, auth.token);

    let url = `${BROADCASTIFY_LIVE_ENDPOINT}?groups=${GROUP_ID}`;
    if (pos) {
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

    const processedIncidents: DispatchIncident[] = [];

    for (const call of data.calls) {
      try {
        console.log(`\n--- Processing call ${call.ts} ---`);
        console.log('Downloading audio from:', call.url);

        const transcript = await transcribeAudio(call.url);
        console.log('Raw transcription from Whisper:', transcript);

        const parsed = await parseDispatchCallWithAI(transcript);

        if (!parsed.address) {
          console.log('❌ Skipping - missing address');
          continue;
        }

        const finalCallType = parsed.callType || 'Fire/EMS Call';

        console.log('Geocoding address:', parsed.address);
        const coordinates = await geocodeAddress(parsed.address);
        console.log('Coordinates:', coordinates);

        if (!coordinates) {
          console.log('❌ Skipping - geocoding failed');
          continue;
        }

        const incident: DispatchIncident = {
          id: `${call.groupId}-${call.ts}-${call.start_ts}`,
          callType: finalCallType,
          units: parsed.units,
          channels: parsed.channels,
          address: parsed.address,
          location: {
            type: 'Point',
            coordinates,
          },
          timestamp: new Date(call.ts * 1000),
          audioUrl: call.url,
          rawTranscript: transcript,
          groupId: call.groupId,
          duration: call.duration,
        };

        console.log('✓ Successfully processed incident:', incident.id);
        processedIncidents.push(incident);
      } catch (error) {
        console.error(`❌ Error processing call ${call.ts}:`, error);
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log('Total calls received:', data.calls.length);
    console.log('Successfully processed:', processedIncidents.length);
    console.log('=== BROADCASTIFY LIVE CALLS API END ===\n');

    return NextResponse.json({
      incidents: processedIncidents,
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
