import { useState, useEffect, useCallback, useRef } from 'react';
import { FireIncident } from '@/types/incident';
import { supabase, SupabaseIncident } from '@/lib/supabase';

function parseLocation(location: string | null): [number, number] | null {
  if (!location) return null;

  if (location.startsWith('POINT(')) {
    const match = location.match(/POINT\(([^\s]+)\s+([^\s]+)\)/);
    if (!match) return null;
    return [parseFloat(match[1]), parseFloat(match[2])];
  }

  if (location.startsWith('0101000020')) {
    try {
      const buffer = new Uint8Array(location.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const view = new DataView(buffer.buffer);

      const byteOrder = view.getUint8(0);
      const littleEndian = byteOrder === 1;

      const lon = view.getFloat64(9, littleEndian);
      const lat = view.getFloat64(17, littleEndian);

      return [lon, lat];
    } catch (error) {
      console.error('Error parsing WKB location:', error);
      return null;
    }
  }

  return null;
}

function convertSupabaseToFireIncident(incident: SupabaseIncident): FireIncident {
  const coordinates = parseLocation(incident.location);

  return {
    traffic_report_id: incident.external_id,
    published_date: incident.timestamp,
    issue_reported: incident.call_type,
    location: coordinates ? {
      type: 'Point',
      coordinates,
    } : {
      type: 'Point',
      coordinates: [0, 0],
    },
    latitude: coordinates ? coordinates[1].toString() : '0',
    longitude: coordinates ? coordinates[0].toString() : '0',
    address: incident.address,
    traffic_report_status: 'ACTIVE' as const,
    traffic_report_status_date_time: incident.timestamp,
    agency: 'Austin Fire Department',
    incidentType: incident.incident_type,
    units: incident.units,
    channels: incident.channels,
    audioUrl: incident.audio_url || undefined,
    rawTranscript: incident.raw_transcript || undefined,
    estimatedResolutionMinutes: incident.estimated_resolution_minutes || undefined,
  };
}

function deduplicateIncidents(incidents: FireIncident[]): FireIncident[] {
  const sortedByTime = [...incidents].sort((a, b) =>
    new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
  );

  const normalizeCallType = (callType: string) => {
    return callType.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const normalizeAddress = (addr: string) => {
    if (!addr || addr === '?') return '';
    return addr.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  };

  const seenByCallType = new Map<string, FireIncident[]>();
  const finalDeduped: FireIncident[] = [];

  for (const inc of sortedByTime) {
    const normalizedCallType = normalizeCallType(inc.issue_reported);

    if (!seenByCallType.has(normalizedCallType)) {
      seenByCallType.set(normalizedCallType, []);
    }
    seenByCallType.get(normalizedCallType)!.push(inc);
  }

  for (const [, incs] of seenByCallType.entries()) {
    const incidentsWithAddress = incs.filter(inc => inc.address && inc.address !== '?');
    const incidentsWithoutAddress = incs.filter(inc => !inc.address || inc.address === '?');

    const grouped = new Map<string, FireIncident[]>();

    for (const inc of incidentsWithAddress) {
      const normalizedAddr = normalizeAddress(inc.address);
      if (!grouped.has(normalizedAddr)) {
        grouped.set(normalizedAddr, []);
      }
      grouped.get(normalizedAddr)!.push(inc);
    }

    for (const [, addressIncidents] of grouped.entries()) {
      const sorted = addressIncidents.sort((a, b) =>
        new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
      );
      finalDeduped.push(sorted[0]);
    }

    if (incidentsWithoutAddress.length > 0) {
      const allUnitsInAddressedIncidents = new Set<string>();
      for (const inc of incidentsWithAddress) {
        if (inc.units) {
          inc.units.forEach(unit => allUnitsInAddressedIncidents.add(unit));
        }
      }

      for (const inc of incidentsWithoutAddress) {
        if (!inc.units || inc.units.length === 0) {
          continue;
        }

        const hasUniqueUnits = inc.units.some(unit => !allUnitsInAddressedIncidents.has(unit));

        if (hasUniqueUnits) {
          finalDeduped.push(inc);
        }
      }
    }
  }

  return finalDeduped;
}

export function removeUnitsFromOlderIncidents(incidents: FireIncident[]): FireIncident[] {
  const sortedByTime = [...incidents].sort((a, b) =>
    new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
  );

  const assignedUnits = new Set<string>();
  const result: FireIncident[] = [];

  for (const inc of sortedByTime) {
    if (!inc.units || inc.units.length === 0) {
      result.push(inc);
      continue;
    }

    const availableUnits = inc.units.filter(unit => !assignedUnits.has(unit));

    if (availableUnits.length === 0) {
      continue;
    }

    result.push({
      ...inc,
      units: availableUnits,
    });

    availableUnits.forEach(unit => assignedUnits.add(unit));
  }

  return result;
}

async function fetchIncidentsFromSupabase(): Promise<FireIncident[]> {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select('id, call_type, address, location, units, channels, timestamp, audio_url, raw_transcript, estimated_resolution_minutes, incident_type, group_id, duration, external_id, created_at')
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Error fetching incidents from Supabase:', error);
      return [];
    }

    const incidents = (data as SupabaseIncident[]).map(convertSupabaseToFireIncident);
    return deduplicateIncidents(incidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    return [];
  }
}

const CACHE_KEY_INCIDENTS = 'supabase_incidents_cache';

export function useFireIncidents() {
  const [incidents, setIncidents] = useState<FireIncident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialFetchComplete, setIsInitialFetchComplete] = useState(false);
  const isInitializedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (manual = false) => {
    if (isFetchingRef.current) {
      console.log('⚠️ Fetch already in progress, skipping...');
      return;
    }

    try {
      isFetchingRef.current = true;
      setError(null);
      if (manual) {
        setIsManualRefresh(true);
      }

      console.log('=== FETCH START (SUPABASE) ===');

      const fetchedIncidents = await fetchIncidentsFromSupabase();

      console.log('Fetched incidents from Supabase:', fetchedIncidents.length);

      setIncidents(fetchedIncidents);
      localStorage.setItem(CACHE_KEY_INCIDENTS, JSON.stringify(fetchedIncidents));

      setLastUpdated(new Date());
      setIsLoading(false);
      setIsInitialFetchComplete(true);
      console.log('=== FETCH END ===\n');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setIsLoading(false);
      setIsInitialFetchComplete(true);
    } finally {
      isFetchingRef.current = false;
      if (manual) {
        setTimeout(() => setIsManualRefresh(false), 100);
      }
    }
  }, []);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;

      console.log('=== INITIALIZATION ===');

      try {
        const cachedIncidents = localStorage.getItem(CACHE_KEY_INCIDENTS);

        if (cachedIncidents) {
          const parsed = JSON.parse(cachedIncidents) as FireIncident[];
          console.log('Loaded from cache:', parsed.length, 'incidents');
          setIncidents(parsed);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load cache:', error);
      }

      console.log('=== INITIALIZATION END ===\n');

      fetchData();
    }

    const subscription = supabase
      .channel('incidents_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents' },
        (payload) => {
          console.log('New incident received via realtime:', payload.new);
          const newIncident = convertSupabaseToFireIncident(payload.new as SupabaseIncident);
          setIncidents(prev => deduplicateIncidents([newIncident, ...prev]));
        }
      )
      .subscribe();

    const refreshInterval = setInterval(fetchData, 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [fetchData]);

  const manualRefetch = useCallback(() => fetchData(true), [fetchData]);

  const resetStorage = useCallback(() => {
    console.log('=== RESET STORAGE ===');

    localStorage.removeItem(CACHE_KEY_INCIDENTS);

    isInitializedRef.current = false;

    setIncidents([]);
    setIsLoading(true);
    setIsInitialFetchComplete(false);

    console.log('Storage cleared, re-initializing...');

    setTimeout(() => {
      isInitializedRef.current = true;
      fetchData(true);
    }, 100);
  }, [fetchData]);

  return {
    incidents,
    error,
    lastUpdated,
    isManualRefresh,
    isLoading,
    isInitialFetchComplete,
    refetch: manualRefetch,
    resetStorage
  };
}