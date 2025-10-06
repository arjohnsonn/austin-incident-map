import { ParsedDispatchCall } from '@/types/broadcastify';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  processed = processed.replace(/\bQuinn\s+(\d+)\b/gi, 'Quint $1');

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
- callType: The EXACT call type/incident type as stated in the audio. IMPORTANT: If an alarm level is mentioned (First Alarm, Second Alarm, Third Alarm, Fourth Alarm, Fifth Alarm, etc.), ALWAYS use that as the call type - it takes priority over all other descriptions. Otherwise, use the exact wording from the dispatch with proper Title Case capitalization (e.g., "respiratory" → "Respiratory", "lift assist" → "Lift Assist", "traffic injury" → "Traffic Injury", "chest pain" → "Chest Pain"). Example: "second alarm, engine 33, fire standby" should extract "Second Alarm" as the call type.
- units: Array of responding units (e.g., ["Engine 13", "Truck 3", "Medic 5", "Quint 34"]). Common unit types: Engine, Truck, Ladder, Medic, Ambulance, Battalion, Squad, Rescue, Brush, Quint. Note: "Quinn" in audio is actually "Quint" (a fire apparatus type). IMPORTANT: DO NOT extract "ESD" (Emergency Services District) numbers as units - "ESD 14" is a geographic area, not a unit. DO NOT extract alarm box identifiers (e.g., "box BL1", "box 123") as units. Only extract actual apparatus/unit callouts. Unit numbers should NOT contain dashes - remove any dashes from unit numbers (e.g., "14-01" becomes "1401", "12-02" becomes "1202").
- channels: Array of tactical/radio channels ONLY. Valid channels are: F-TAC (fire tactical), Firecom, Medcom. Format F-TAC channels as "F-TAC-###" (e.g., "F-TAC-201" NOT "FD-201"). DO NOT include "Box" numbers as channels - those are alarm box identifiers, not radio channels. Examples: ["F-TAC-203"], ["Firecom 1"], ["Medcom 2"]
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

    const cleanedUnits = (result.units || []).map((unit: string) => {
      return unit.replace(/(\w+)\s+(\d+)-(\d+)/g, '$1 $2$3');
    });

    console.log('AI Parsed Result:', {
      callType: result.callType || null,
      units: cleanedUnits,
      channels: result.channels || [],
      address: result.address || null,
    });

    console.log('--- AI DISPATCH PARSER END ---\n');

    return {
      callType: result.callType || null,
      units: cleanedUnits,
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
  console.log('\nExtracting call type from transcript:');

  const alarmMatch = cleanedTranscript.match(/\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+alarm\b/i);
  if (alarmMatch) {
    const alarmLevel = alarmMatch[1].toLowerCase();
    const alarmMap: Record<string, string> = {
      'first': 'First Alarm', '1st': 'First Alarm',
      'second': 'Second Alarm', '2nd': 'Second Alarm',
      'third': 'Third Alarm', '3rd': 'Third Alarm',
      'fourth': 'Fourth Alarm', '4th': 'Fourth Alarm',
      'fifth': 'Fifth Alarm', '5th': 'Fifth Alarm',
    };
    callType = alarmMap[alarmLevel] || 'Alarm';
    console.log(`  ✓ Extracted alarm level as call type: "${callType}"`);
  } else {
    const callTypeMatch = cleanedTranscript.match(/(?:^|\s|,)\s*([A-Za-z\s]+?)\s+(?:in|at|on|for)\s+(?:AFD|ASD|AFV)\s+box/i);
    if (callTypeMatch) {
      callType = callTypeMatch[1].trim();
      const words = callType.split(/\s+/);
      callType = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      console.log(`  ✓ Extracted call type: "${callType}"`);
    } else {
      console.log('  ✗ No call type extracted');
    }
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
