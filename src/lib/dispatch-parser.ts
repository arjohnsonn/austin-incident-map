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
  /\b(?:arff)\s*(\d+)\b/gi,
  /\bSR[-\s]*(\d+)\b/gi,
];

const CHANNEL_PATTERN = /(?:F-TAC|FTAC|TAC|Fire\s*TAC)[-\s]*(\d+)/gi;

const ADDRESS_PATTERNS = [
  /(?:at|@)\s+(\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
  /(\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
  /(?:at|@)\s+([A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\s+and\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir))/i,
];

export function quickEstimateResolution(transcript: string): number {
  const lower = transcript.toLowerCase();

  if (/\b(fifth|5th)\s+alarm\b/i.test(lower)) return 480;
  if (/\b(fourth|4th)\s+alarm\b/i.test(lower)) return 360;
  if (/\b(third|3rd)\s+alarm\b/i.test(lower)) return 240;
  if (/\b(second|2nd)\s+alarm\b/i.test(lower)) return 180;
  if (/\b(first|1st)\s+alarm\b/i.test(lower) || /\bbox\s+alarm\b/i.test(lower)) return 90;

  if (/\btask\s+force\b/i.test(lower)) return 90;

  if (/\b(structure\s+fire|building\s+fire|house\s+fire)\b/i.test(lower)) return 45;
  if (/\b(vehicle\s+fire|car\s+fire)\b/i.test(lower)) return 30;
  if (/\b(brush\s+fire|wildfire|grass\s+fire)\b/i.test(lower)) return 45;
  if (/\b(hazmat|hazardous\s+materials)\b/i.test(lower)) return 90;
  if (/\b(rescue|confined\s+space|trench\s+rescue|water\s+rescue)\b/i.test(lower)) return 60;

  if (/\b(cardiac\s+arrest|code\s+blue|cpr)\b/i.test(lower)) return 30;
  if (/\b(chest\s+pain|heart\s+attack|mi\b)\b/i.test(lower)) return 30;
  if (/\b(stroke|cva)\b/i.test(lower)) return 30;
  if (/\b(unconscious|unresponsive)\b/i.test(lower)) return 30;
  if (/\b(respiratory|breathing|difficulty\s+breathing)\b/i.test(lower)) return 30;
  if (/\b(trauma|shooting|gunshot|stabbing)\b/i.test(lower)) return 45;
  if (/\b(overdose|od\b)\b/i.test(lower)) return 30;

  if (/\b(lift\s+assist)\b/i.test(lower)) return 20;
  if (/\b(alarm\s+activation|fire\s+alarm)\b/i.test(lower)) return 15;
  if (/\b(fall|fallen)\b/i.test(lower)) return 25;

  if (/\b(mva|motor\s+vehicle\s+accident|traffic\s+accident|collision)\b/i.test(lower)) return 45;

  return 60;
}

function preprocessTranscript(transcript: string): string {
  let processed = transcript;

  processed = processed.replace(/\bASD\b/gi, 'AFD');
  processed = processed.replace(/\bAFV\b/gi, 'AFD');
  processed = processed.replace(/\bARV\s*(\d+)\b/gi, 'ARFF $1');
  processed = processed.replace(/\bN\s*(\d+)\b/gi, 'Engine $1');
  processed = processed.replace(/\bQuinn\s+(\d+)\b/gi, 'Quint $1');
  processed = processed.replace(/\bWind\s+(\d+)\b/gi, 'Quint $1');
  processed = processed.replace(/\bTwin\s+(\d+)\b/gi, 'Quint $1');
  processed = processed.replace(/\b(Quint)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Engine)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Truck)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Ladder)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Medic)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Battalion)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Squad)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Rescue)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Brush)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(ARFF)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\b(Ambulance)(\d+)\b/gi, '$1 $2');
  processed = processed.replace(/\bItalian\s+(\d+)\b/gi, 'Battalion $1');
  processed = processed.replace(/\bWAD\s+(\d+)\b/gi, 'Squad $1');
  processed = processed.replace(/\bAPS\s+(\d+)/gi, 'at $1');
  processed = processed.replace(/\bF[-\s]?Pack[-\s]*(\d+)\b/gi, 'F-TAC-$1');
  processed = processed.replace(/\bFPack[-\s]*(\d+)\b/gi, 'F-TAC-$1');
  processed = processed.replace(/\bS[-\s]?Pack[-\s]+(\d+)\b/gi, 'F-TAC-$1');
  processed = processed.replace(/\bFox\s+Alarm\b/gi, 'Box Alarm');
  processed = processed.replace(/\bFillbox\s+Alarm\b/gi, 'Stillbox Alarm');
  processed = processed.replace(/\bthree\s+down\b/gi, 'Tree Down');
  processed = processed.replace(/\b3\s+down\b/gi, 'Tree Down');
  processed = processed.replace(/\bpower\s+lines?\s+down\b/gi, 'powerline down');

  processed = processed.replace(/\bof\s+this\s+(EMS|CMS)\b/gi, 'Assist EMS');
  processed = processed.replace(/\bRogue\b(?!\s+\d)/gi, 'Stroke');
  processed = processed.replace(/\bPaul\b/gi, 'Fall');
  processed = processed.replace(/\bVehicle\s+Buyer\b/gi, 'Vehicle Fire');

  processed = processed.replace(/\bActs\s+(\d+)/gi, 'at $1');
  processed = processed.replace(/\bPlate\b/gi, 'Place');

  processed = processed.replace(/\b(\d{1,2})00(\d{3,5})\s+(East|West|North|South|[A-Z])/gi, '$1$2 $3');

  processed = processed.replace(/\b(\d{4})(\d{4})\s+(East|West|North|South|[A-Z])/gi, '$1-$2 $3');
  processed = processed.replace(/\b(\d\d)(\d\d)(\d\d)\s+(East|West|North|South|[A-Z])/gi, (_match, first, middle, last, direction) => {
    const firstNum = parseInt(first);
    const middleNum = parseInt(middle);

    if (firstNum === middleNum) {
      return `${first}00-${middle}${last} ${direction}`;
    }

    if (middleNum > firstNum && middleNum - firstNum <= 3) {
      return `${first}00-${middle}${last} ${direction}`;
    }

    return `${first}${middle}-${last} ${direction}`;
  });
  processed = processed.replace(/\b(\d{3})(\d{3})\s+(East|West|North|South|[A-Z])/gi, '$1-$2 $3');
  processed = processed.replace(/\b(\d{4})(\d{3})\s+(East|West|North|South|[A-Z])/gi, '$1-$2 $3');
  processed = processed.replace(/\b(\d{4})(\d{2})\s+(East|West|North|South|[A-Z])/gi, '$1-$2 $3');

  processed = processed.replace(/\b(\d0)\s+(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth)\b/gi, (_match, tens, ordinal) => {
    const tensValue = parseInt(tens);
    const onesMap: Record<string, number> = {
      'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
      'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9
    };
    const ones = onesMap[ordinal.toLowerCase()];
    const combined = tensValue + ones;
    const suffix =
      combined % 10 === 1 && combined % 100 !== 11 ? 'st' :
      combined % 10 === 2 && combined % 100 !== 12 ? 'nd' :
      combined % 10 === 3 && combined % 100 !== 13 ? 'rd' : 'th';
    return `${combined}${suffix}`;
  });

  processed = processed.replace(/\b(?:Bach|batch)\s*,?\s*ST[-\s]*(\d+)/gi, 'Box ST-$1');
  processed = processed.replace(/\b(?:Chesapeake|Chesapeakene|Chespane|Champaign)\b/gi, 'Chest Pain');
  processed = processed.replace(/\bESC\s+(\d+)/gi, 'ESD $1');
  processed = processed.replace(/\b[BbRr]roke\b/g, 'stroke');


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
- callType: Extract ONLY the incident/call type itself - the core emergency type without any location details, box numbers, or extra context. Apply PROPER TITLE CASE CAPITALIZATION. DO NOT include: "in AFD box", "at [address]", "on [channel]", alarm box identifiers, geographic areas, or any location information. ALWAYS STRIP instruction words that modify the incident type, including: "check", "verify", "confirm", "standby", "stage", "staging" - these are operational instructions, NOT part of the call type (e.g., "Assault Check" → "Assault", "Assault check for possible staging instructions" → "Assault", "Fire Standby" → "Fire", "Medical Verify" → "Medical"). Examples: "unlock alarm in AFD box 18-01 at East 290 Service Road" → "Unlock Alarm" (NOT "Unlock Alarm In AFD Box 18-01"), "assist person stuck in elevator in AFD box 5106 at 4700 Westgate Blvd" → "Assist Person Stuck In Elevator", "lift assist code 1 in AFD box 801" → "Lift Assist Code 1", "gunshot wound" → "Gunshot Wound", "respiratory" → "Respiratory", "vehicle fire" → "Vehicle Fire", "Assault check" → "Assault", "Assault Check" → "Assault". IMPORTANT: "Code 1", "Code One", "Code 2", "Code Two", etc. are priority levels and should NEVER be standalone call types - they must be combined with the actual incident type (e.g., "Sick Person Code 1", "Fall Code 2"). If an alarm level is mentioned (First Alarm, Second Alarm, etc.), use that as the call type. Extract ONLY the emergency type, nothing else.
- incidentType: Classify the incident as either "fire" or "medical". Fire incidents include: fires, alarms, smoke, vehicle fires, structure fires, brush fires, hazmat, gas leaks, explosions, rescues (not medical), technical rescues. Medical incidents include: medical emergencies, chest pain, respiratory issues, unconscious persons, injuries, falls, lift assists, cardiac arrest, strokes, seizures, overdoses, diabetic emergencies, any EMS/medical response.
- units: Array of ALL responding units mentioned ANYWHERE in the transcript. CRITICAL: You must scan the ENTIRE transcript from start to end and extract EVERY unit mentioned. Units can appear at the beginning ("Engine 33, chest pain"), in the middle, or in a list at the end ("Response: Engine 3, Truck 3, Engine 14"). Example: "Second alarm, engine 33, fire standby... Response on FD-201, Engine 3, Truck 3, Engine 14" should extract ["Engine 33", "Engine 3", "Truck 3", "Engine 14"]. Common unit types: Engine, Truck, Ladder, Medic, Ambulance, Battalion, Squad, Rescue, Brush, Quint, FTO, Safety Officer, Command, Investigator, Wildfire Support, SR (Special Response), ARFF (Aircraft Rescue and Firefighting - airport fire units). IMPORTANT UNIT CORRECTIONS: (1) "ARV" followed by numbers is a TRANSCRIPTION ERROR - it should be "ARFF" (e.g., "ARV 301" → "ARFF 301", "ARV2" → "ARFF 2"). (2) "SR-20" or "SR 20" is a UNIT (Special Response unit), not a call type. Example: "SR-20 fall at 123 Main St" means unit "SR20" responding to a "Fall" call. (3) "Quinn" in audio is actually "Quint" (a fire apparatus type). DO NOT extract "ESD" (Emergency Services District) numbers as units - "ESD 14" is a geographic area, not a unit. DO NOT extract "APS" followed by numbers as units - "APS 2803" is part of an address, not a unit. DO NOT extract "F-TAC", "FTAC", "F-Pack", "FPack", or "F Pack" followed by numbers as units - these are radio CHANNELS, not units (e.g., "F-TAC 203", "F-Pack 203", "FPack203" are all channels, NOT units). DO NOT extract alarm box identifiers as units - patterns like "Box ST-51", "Box 2101", "Box BL1", "box 1234", "ST 51", "ST-51", "BL1", etc. are location/box identifiers, NOT units. Box identifiers typically appear after "in AFD box", "in ESD", or standalone and should be completely ignored. Only extract actual apparatus/unit callouts. Unit numbers should NOT contain dashes - remove any dashes from unit numbers (e.g., "14-01" becomes "1401", "12-02" becomes "1202", "SR-20" becomes "SR20", but "ARFF 301" stays as "ARFF 301").
- channels: Array of tactical/radio channels ONLY. Valid channels are: F-TAC (fire tactical), Firecom, Medcom. IMPORTANT: "F-TAC" or "FTAC" followed by numbers is a CHANNEL, not a unit (e.g., "F-TAC 203", "F-Pack 203" transcribed from audio is "F-TAC-203" channel). Include directional suffixes for Firecom channels (e.g., "Firecom North", "Firecom South", "Firecom East", "Firecom West") - NEVER truncate to just "Firecom". Format F-TAC channels as "F-TAC-###" (e.g., "F-TAC-201" NOT "FD-201" or "FD201"). DO NOT include "Box" numbers as channels - those are alarm box identifiers, not radio channels. Examples: ["F-TAC-203"], ["Firecom North"], ["Firecom South"], ["Medcom 2"]
- address: Primary street address extracted from audio. IMPORTANT: Speech recognition often garbles addresses - you MUST attempt to correct obvious errors and reconstruct the intended address. Common errors: "Acts" → "at", misspelled street names (e.g., "Vanmieter" → "Van Meter", "Guadaloop" → "Guadalupe"), split words (e.g., "Plate" → "Place", "Burr Net" → "Burnet"), run-together numbers and streets. CRITICAL ADDRESS NUMBER RULES: (1) Standard Austin addresses are typically 3-5 digits (e.g., "123", "1234", "12345"). If you see a 6-7 digit number like "1300609" or "777923", this is LIKELY A TRANSCRIPTION ERROR with extra digits concatenated. Check if removing leading/middle zeros creates a valid address (e.g., "1300609" → "13609", "7700923" → "7923"). (2) For address ranges separated by dashes (e.g., "7700-7923"), KEEP THE FULL RANGE FORMAT "7700-7923", do NOT concatenate into a single number. (3) Airport fire units are "ARFF" (Aircraft Rescue and Firefighting), NOT "ARV" - the transcript may mishear this. Examples: "Acts 18609 Vanmieter Plate" → "18609 Van Meter Place", "APS 2803 Parker Lane" → "2803 Parker Lane", "12212 to 12316 Anderson Mill Road" → "12212-12316 Anderson Mill Road", "1300609 North Interstate" → "13609 North Interstate" (removed extra zeros), "7700-7923 North Capital" → "7700-7923 North Capital" (kept range format). If you can identify a street number (e.g., "18609") followed by what appears to be a garbled street name (e.g., "Vanmieter Plate"), attempt to reconstruct it as a valid address. Format address ranges with dashes (e.g., "2200-2400 North Interstate 35" NOT "2200 to 2400" or "22002400").
- addressVariants: Array of 5-10 comprehensive address variations for geocoding, optimized for Austin/Travis County, TX. GENERATE VARIANTS COVERING ALL ABBREVIATION COMBINATIONS. Include: (1) Original address as heard, (2) Variants with ALL street type abbreviations: St/Street, Blvd/Boulevard, Rd/Road, Dr/Drive, Ln/Lane, Ave/Avenue, Ct/Court, Pl/Place, Pkwy/Parkway, Trl/Trail, Loop, Cir/Circle, Frontage/Frntg, Service/Svc, (3) Variants with ALL directional abbreviations: N/North, S/South, E/East, W/West, NE/Northeast, NW/Northwest, SE/Southeast, SW/Southwest, (4) Combinations of abbreviated and expanded forms (e.g., for "Woodward St & E Ben White Blvd Frontage Rd" generate: "Woodward Street & East Ben White Boulevard Frontage Road", "Woodward St & East Ben White Blvd Frontage Rd", "Woodward Street & E Ben White Boulevard Frontage Rd", etc.), (5) Austin/Travis County location suffixes ("Austin TX", "Travis County TX"), (6) Corrected spellings of known Austin streets (e.g., "Guadalupe" often mistranscribed, "Lamar" variants, "MoPac"/"Loop 1", "I-35"/"Interstate 35" variants), (7) Variants without directional prefixes if applicable. For address ranges, include variants with just the first number (e.g., for "2200-2400 Main St", include "2200 Main St"). Examples: ["2328 Hartford Road", "2328 Hartford Rd", "2328 Hartford Road Austin TX", "2328 Hartford Rd Travis County TX"]. For highways: ["I-35 North", "Interstate 35 North", "I-35", "US Highway 35"]. For complex intersections: ["Woodward St & E Ben White Blvd Frontage Rd", "Woodward Street & East Ben White Boulevard Frontage Road", "Woodward St & East Ben White Blvd Service Rd", "Woodward Street & E Ben White Blvd Frontage Rd"]. Always ensure variants are appropriate for Austin/Travis County geography.
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

    const cleanedUnits = (result.units || [])
      .map((unit: string) => {
        let cleaned = unit.replace(/(\w+)\s+(\d+)-(\d+)/g, '$1 $2$3');
        cleaned = cleaned.replace(/^Italian\s+(\d+)$/i, 'Battalion $1');
        cleaned = cleaned.replace(/^Quinn\s+(\d+)$/i, 'Quint $1');
        cleaned = cleaned.replace(/^Wind\s+(\d+)$/i, 'Quint $1');
        cleaned = cleaned.replace(/^Twin\s+(\d+)$/i, 'Quint $1');
        cleaned = cleaned.replace(/^ARV\s+(\d+)$/i, 'ARFF $1');
        return cleaned;
      })
      .filter((unit: string) => {
        return !/^F[-\s]?Pack[-\s]*\d+$/i.test(unit) && !/^FPack[-\s]*\d+$/i.test(unit);
      });

    const cleanedChannels = (result.channels || []).map((channel: string) => {
      if (/^F[-\s]?Pack[-\s]*(\d+)$/i.test(channel)) {
        return channel.replace(/^F[-\s]?Pack[-\s]*(\d+)$/i, 'F-TAC-$1');
      }
      if (/^FPack[-\s]*(\d+)$/i.test(channel)) {
        return channel.replace(/^FPack[-\s]*(\d+)$/i, 'F-TAC-$1');
      }
      if (/^FD[-\s]*(\d+)$/i.test(channel)) {
        return channel.replace(/^FD[-\s]*(\d+)$/i, 'F-TAC-$1');
      }
      return channel;
    });

    const incidentType = result.incidentType === 'medical' ? 'medical' : result.incidentType === 'fire' ? 'fire' : null;

    console.log('AI Parsed Result:', {
      callType: result.callType || null,
      incidentType: incidentType,
      units: cleanedUnits,
      channels: cleanedChannels,
      address: result.address || null,
      addressVariants: result.addressVariants || [],
      estimatedResolutionMinutes: result.estimatedResolutionMinutes || 60,
    });

    console.log('--- AI DISPATCH PARSER END ---\n');

    return {
      callType: result.callType || null,
      incidentType: incidentType,
      units: cleanedUnits,
      channels: cleanedChannels,
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
      else if (unitType.toLowerCase() === 'arff') unitType = 'ARFF';
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
    incidentType: null,
    units,
    channels,
    address,
    addressVariants: [],
    estimatedResolutionMinutes: 60,
    rawTranscript: cleanedTranscript,
  };
}
