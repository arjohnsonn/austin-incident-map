import { ParsedDispatchCall } from '@/types/broadcastify';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CALL_TYPE_PATTERNS = [
  { pattern: /still\s+box\s+alarm/i, type: 'Still Box Alarm' },
  { pattern: /box\s+alarm/i, type: 'Box Alarm' },
  { pattern: /carbon\s+monoxide(?:\s+detector)?(?:\s+activation)?/i, type: 'Carbon Monoxide Alarm' },
  { pattern: /co\s+(?:detector|alarm)/i, type: 'Carbon Monoxide Alarm' },
  { pattern: /smoke\s+(?:detector|alarm)(?:\s+activation)?/i, type: 'Smoke Alarm' },
  { pattern: /fire\s+alarm(?:\s+activation)?/i, type: 'Fire Alarm' },
  { pattern: /alarm\s+activation/i, type: 'Alarm Activation' },
  { pattern: /\balarm\b(?!\s+(?:in|at))/i, type: 'Alarm' },
  { pattern: /box\s+fire/i, type: 'Box Fire' },
  { pattern: /structure\s+fire/i, type: 'Structure Fire' },
  { pattern: /(?:house|building|apartment)\s+fire/i, type: 'Structure Fire' },
  { pattern: /vehicle\s+fire/i, type: 'Vehicle Fire' },
  { pattern: /car\s+fire/i, type: 'Vehicle Fire' },
  { pattern: /grass\s+fire/i, type: 'Grass Fire' },
  { pattern: /brush\s+fire/i, type: 'Brush Fire' },
  { pattern: /trash\s+fire/i, type: 'Trash Fire' },
  { pattern: /medical\s+(?:emergency|call)/i, type: 'Medical Emergency' },
  { pattern: /cardiac\s+arrest/i, type: 'Cardiac Arrest' },
  { pattern: /heart\s+attack/i, type: 'Cardiac Arrest' },
  { pattern: /ems\s+call/i, type: 'EMS Call' },
  { pattern: /stroke/i, type: 'Medical Emergency' },
  { pattern: /unconscious/i, type: 'Medical Emergency' },
  { pattern: /traffic\s+(?:accident|collision)/i, type: 'Traffic Accident' },
  { pattern: /vehicle\s+(?:accident|collision)/i, type: 'Vehicle Accident' },
  { pattern: /mvc/i, type: 'Motor Vehicle Collision' },
  { pattern: /auto\s+accident/i, type: 'Traffic Accident' },
  { pattern: /hazmat/i, type: 'Hazmat' },
  { pattern: /gas\s+leak/i, type: 'Gas Leak' },
  { pattern: /water\s+rescue/i, type: 'Water Rescue' },
  { pattern: /technical\s+rescue/i, type: 'Technical Rescue' },
  { pattern: /elevator\s+rescue/i, type: 'Elevator Rescue' },
  { pattern: /smoke\s+investigation/i, type: 'Smoke Investigation' },
  { pattern: /odor\s+investigation/i, type: 'Odor Investigation' },
  { pattern: /assist\s+(?:ems|police)/i, type: 'Mutual Aid' },
];

const UNIT_PATTERNS = [
  /\b(?:engine|eng|e)\s*(\d+)\b/gi,
  /\b(?:ladder|lad|l)\s*(\d+)\b/gi,
  /\b(?:truck|trk)\s*(\d+)\b/gi,
  /\b(?:medic|med|m)\s*(\d+)\b/gi,
  /\b(?:ambulance|amb|a)\s*(\d+)\b/gi,
  /\b(?:battalion|bat|bc|b)\s*(\d+)\b/gi,
  /\b(?:squad|sq)\s*(\d+)\b/gi,
  /\b(?:rescue|res|r)\s*(\d+)\b/gi,
  /\b(?:tanker|tan)\s*(\d+)\b/gi,
  /\b(?:brush|br)\s*(\d+)\b/gi,
];

const CHANNEL_PATTERN = /(?:F-TAC|FTAC|TAC|Fire\s*TAC)[-\s]*(\d+)/gi;

const ADDRESS_PATTERNS = [
  /(?:at|@)\s+(\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
  /(\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
  /(?:at|@)\s+([A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\s+and\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
];

function preprocessTranscript(transcript: string): string {
  let processed = transcript;

  processed = processed.replace(/\bASD\b/gi, 'AFD');
  processed = processed.replace(/\bAFV\b/gi, 'AFD');
  processed = processed.replace(/\ball\s+in\b/gi, 'alarm');
  processed = processed.replace(/\bfall\s+in\b/gi, 'alarm');

  return processed;
}

export async function parseDispatchCallWithAI(transcript: string): Promise<ParsedDispatchCall> {
  console.log('\n--- AI DISPATCH PARSER START ---');
  console.log('Original transcript:', transcript);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a fire/EMS dispatch call parser. Extract structured information from dispatch audio transcripts.

Extract:
- callType: Type of emergency (e.g., "Structure Fire", "Carbon Monoxide Alarm", "Medical Emergency", "Box Alarm", "Still Box Alarm", "Traffic Accident", etc.)
- units: Array of responding units (e.g., ["Engine 13", "Truck 3", "Medic 5"])
- channels: Array of tactical channels (e.g., ["F-TAC-203"])
- address: Street address (e.g., "2328 Hartford Road")

Return valid JSON only. If something isn't mentioned, use null or empty array.`
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 200,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    console.log('AI Parsed Result:', {
      callType: result.callType || null,
      units: result.units || [],
      channels: result.channels || [],
      address: result.address || null,
    });

    console.log('--- AI DISPATCH PARSER END ---\n');

    return {
      callType: result.callType || null,
      units: result.units || [],
      channels: result.channels || [],
      address: result.address || null,
      rawTranscript: transcript,
    };
  } catch (error) {
    console.error('AI parsing failed, falling back to regex parser:', error);
    return parseDispatchCall(transcript);
  }
}

export function parseDispatchCall(transcript: string): ParsedDispatchCall {
  console.log('\n--- DISPATCH PARSER START ---');
  console.log('Original transcript:', transcript);

  const cleanedTranscript = preprocessTranscript(transcript);
  console.log('After preprocessing:', cleanedTranscript);

  const normalizedTranscript = cleanedTranscript.toLowerCase();
  console.log('Normalized (lowercase):', normalizedTranscript);

  let callType: string | null = null;
  console.log('\nTesting call type patterns:');
  for (const { pattern, type } of CALL_TYPE_PATTERNS) {
    const matches = pattern.test(normalizedTranscript);
    if (matches) {
      console.log(`  ✓ MATCH: "${pattern}" → ${type}`);
      callType = type;
      break;
    }
  }

  if (!callType) {
    console.log('  ✗ No call type pattern matched');
  }

  const units: string[] = [];
  const unitSet = new Set<string>();

  console.log('\nExtracting units:');
  for (const pattern of UNIT_PATTERNS) {
    let match;
    while ((match = pattern.exec(cleanedTranscript)) !== null) {
      const fullMatch = match[0];
      const unitNumber = match[1];

      let unitType = fullMatch.replace(/\d+/g, '').trim();
      if (unitType.toLowerCase() === 'e') unitType = 'Engine';
      else if (unitType.toLowerCase() === 'l') unitType = 'Ladder';
      else if (unitType.toLowerCase() === 't' || unitType.toLowerCase() === 'trk') unitType = 'Truck';
      else if (unitType.toLowerCase() === 'm' || unitType.toLowerCase() === 'med') unitType = 'Medic';
      else unitType = unitType.charAt(0).toUpperCase() + unitType.slice(1).toLowerCase();

      const unitName = `${unitType} ${unitNumber}`;
      if (!unitSet.has(unitName)) {
        unitSet.add(unitName);
        units.push(unitName);
        console.log(`  Found: ${unitName}`);
      }
    }
  }

  if (units.length === 0) {
    console.log('  No units found');
  }

  const channels: string[] = [];
  console.log('\nExtracting tactical channels:');
  let channelMatch;
  while ((channelMatch = CHANNEL_PATTERN.exec(cleanedTranscript)) !== null) {
    const channel = `F-TAC-${channelMatch[1]}`;
    if (!channels.includes(channel)) {
      channels.push(channel);
      console.log(`  Found: ${channel}`);
    }
  }

  if (channels.length === 0) {
    console.log('  No tactical channels found');
  }

  let address: string | null = null;
  console.log('\nExtracting address:');
  for (const pattern of ADDRESS_PATTERNS) {
    const match = cleanedTranscript.match(pattern);
    if (match) {
      address = match[1] || match[0];
      address = address.trim();
      console.log(`  ✓ Found address: "${address}"`);
      break;
    }
  }

  if (!address) {
    console.log('  ✗ No address found');
  }

  console.log('\n--- PARSER RESULTS ---');
  console.log('Call Type:', callType || 'null');
  console.log('Units:', units.length > 0 ? units.join(', ') : 'none');
  console.log('Channels:', channels.length > 0 ? channels.join(', ') : 'none');
  console.log('Address:', address || 'null');
  console.log('--- DISPATCH PARSER END ---\n');

  return {
    callType,
    units,
    channels,
    address,
    rawTranscript: cleanedTranscript,
  };
}
