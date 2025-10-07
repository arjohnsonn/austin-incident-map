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
  /\bSR[-\s]*(\d+)\b/gi,
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
  processed = processed.replace(/\bQuinn\s+(\d+)\b/gi, 'Quint $1');
  processed = processed.replace(/\bthree\s+down\b/gi, 'tree down');
  processed = processed.replace(/\bpower\s+lines?\s+down\b/gi, 'powerline down');

  return processed;
}

export async function parseDispatchCallWithAI(transcript: string): Promise<ParsedDispatchCall> {
  console.log('\n--- AI DISPATCH PARSER START ---');
  console.log('Original transcript:', transcript);

  const cleanedTranscript = preprocessTranscript(transcript);
  if (cleanedTranscript !== transcript) {
    console.log('After preprocessing:', cleanedTranscript);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a fire/EMS dispatch call parser for Austin/Travis County, Texas. Extract structured information from dispatch audio transcripts.

Extract:
- callType: Extract ONLY the incident/call type itself - the core emergency type without any location details, box numbers, or extra context. Apply PROPER TITLE CASE CAPITALIZATION. DO NOT include: "in AFD box", "at [address]", "on [channel]", alarm box identifiers, geographic areas, or any location information. Examples: "unlock alarm in AFD box 18-01 at East 290 Service Road" → "Unlock Alarm" (NOT "Unlock Alarm In AFD Box 18-01"), "assist person stuck in elevator in AFD box 5106 at 4700 Westgate Blvd" → "Assist Person Stuck In Elevator", "lift assist code 1 in AFD box 801" → "Lift Assist Code 1", "gunshot wound" → "Gunshot Wound", "respiratory" → "Respiratory", "vehicle fire" → "Vehicle Fire". If an alarm level is mentioned (First Alarm, Second Alarm, etc.), use that as the call type. Extract ONLY the emergency type, nothing else.
- incidentType: Classify the incident as either "fire" or "medical". Fire incidents include: fires, alarms, smoke, vehicle fires, structure fires, brush fires, hazmat, gas leaks, explosions, rescues (not medical), technical rescues. Medical incidents include: medical emergencies, chest pain, respiratory issues, unconscious persons, injuries, falls, lift assists, cardiac arrest, strokes, seizures, overdoses, diabetic emergencies, any EMS/medical response.
- units: Array of ALL responding units mentioned ANYWHERE in the transcript. CRITICAL: You must scan the ENTIRE transcript from start to end and extract EVERY unit mentioned. Units can appear at the beginning ("Engine 33, chest pain"), in the middle, or in a list at the end ("Response: Engine 3, Truck 3, Engine 14"). Example: "Second alarm, engine 33, fire standby... Response on FD-201, Engine 3, Truck 3, Engine 14" should extract ["Engine 33", "Engine 3", "Truck 3", "Engine 14"]. Common unit types: Engine, Truck, Ladder, Medic, Ambulance, Battalion, Squad, Rescue, Brush, Quint, FTO, Safety Officer, Command, Investigator, Wildfire Support, SR (Special Response). IMPORTANT: "SR-20" or "SR 20" is a UNIT (Special Response unit), not a call type. Example: "SR-20 fall at 123 Main St" means unit "SR20" responding to a "Fall" call. Note: "Quinn" in audio is actually "Quint" (a fire apparatus type). DO NOT extract "ESD" (Emergency Services District) numbers as units - "ESD 14" is a geographic area, not a unit. DO NOT extract alarm box identifiers (e.g., "box BL1", "box 123") as units. Only extract actual apparatus/unit callouts. Unit numbers should NOT contain dashes - remove any dashes from unit numbers (e.g., "14-01" becomes "1401", "12-02" becomes "1202", "SR-20" becomes "SR20").
- channels: Array of tactical/radio channels ONLY. Valid channels are: F-TAC (fire tactical), Firecom, Medcom. IMPORTANT: Include directional suffixes for Firecom channels (e.g., "Firecom North", "Firecom South", "Firecom East", "Firecom West") - NEVER truncate to just "Firecom". Format F-TAC channels as "F-TAC-###" (e.g., "F-TAC-201" NOT "FD-201" or "FD201"). DO NOT include "Box" numbers as channels - those are alarm box identifiers, not radio channels. Examples: ["F-TAC-203"], ["Firecom North"], ["Firecom South"], ["Medcom 2"]
- address: Primary street address extracted from audio. Format address ranges with dashes (e.g., "2200-2400 North Interstate 35" NOT "2200 to 2400"). Example: "2328 Hartford Road"
- addressVariants: Array of 3-5 address variations for geocoding, optimized for Austin/Travis County, TX. Use your knowledge of Austin/Travis County street names to correct likely transcription errors. Include: the original address, address with common Austin/Travis County location suffixes, corrected spellings of known Austin streets (e.g., "Guadalupe" often mistranscribed, "Lamar" boulevard variants, "MoPac"/"Loop 1", "I-35"/"Interstate 35" variants, "South Lamar" vs "S Lamar Blvd"), and without directional prefixes if applicable. For address ranges, include variants with just the first number (e.g., for "2200-2400 Main St", include "2200 Main St"). Examples: ["2328 Hartford Road", "2328 Hartford Rd", "2328 Hartford Road Austin TX", "2328 Hartford Road Travis County TX"]. For highways: ["I-35 North", "Interstate 35 North", "I-35", "US Highway 35"]. Always ensure variants are appropriate for Austin/Travis County geography.
- estimatedResolutionMinutes: Estimated time in minutes until this incident is likely resolved. Guidelines: Medical calls (chest pain, respiratory, unconscious) ~30min, Traffic accidents ~45min, Fire alarm activation ~15min, Lift assist ~20min, First Alarm ~60min, Second Alarm ~120min, Third Alarm+ ~180min, Vehicle fire ~30min, Structure fire without alarm level ~45min, Hazmat ~90min, Rescue ~60min. Consider severity and number of responding units. You do not have to follow these, these are just examples.

Return valid JSON only. If something isn't mentioned, use null or empty array. estimatedResolutionMinutes, incidentType, and addressVariants must always be provided (addressVariants can be empty array if no address).`
        },
        {
          role: 'user',
          content: cleanedTranscript
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    const cleanedUnits = (result.units || []).map((unit: string) => {
      return unit.replace(/(\w+)\s+(\d+)-(\d+)/g, '$1 $2$3');
    });

    const incidentType = result.incidentType === 'medical' ? 'medical' : 'fire';

    console.log('AI Parsed Result:', {
      callType: result.callType || null,
      incidentType: incidentType,
      units: cleanedUnits,
      channels: result.channels || [],
      address: result.address || null,
      addressVariants: result.addressVariants || [],
      estimatedResolutionMinutes: result.estimatedResolutionMinutes || 60,
    });

    console.log('--- AI DISPATCH PARSER END ---\n');

    return {
      callType: result.callType || null,
      incidentType: incidentType,
      units: cleanedUnits,
      channels: result.channels || [],
      address: result.address || null,
      addressVariants: result.addressVariants || [],
      estimatedResolutionMinutes: result.estimatedResolutionMinutes || 60,
      rawTranscript: cleanedTranscript,
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
  console.log('Estimated Resolution:', '60 minutes (fallback default)');
  console.log('--- DISPATCH PARSER END ---\n');

  return {
    callType,
    incidentType: 'fire',
    units,
    channels,
    address,
    addressVariants: [],
    estimatedResolutionMinutes: 60,
    rawTranscript: cleanedTranscript,
  };
}
