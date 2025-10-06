import { useState, useEffect, useCallback, useRef } from 'react';
import { FireIncident } from '@/types/incident';
import { DispatchIncident } from '@/types/broadcastify';

interface RawIncidentData {
  traffic_report_id: string;
  published_date: string;
  issue_reported: string;
  location?: {
    type: string;
    coordinates: [number, number];
  };
  latitude: string;
  longitude: string;
  address: string;
  traffic_report_status: 'ACTIVE' | 'ARCHIVED';
  traffic_report_status_date_time: string;
  agency: string;
}

interface BroadcastifyResponse {
  incidents: DispatchIncident[];
  lastPos: number;
  serverTime: number;
}

const FIRE_API_ENDPOINT = 'https://data.austintexas.gov/resource/wpu4-x69d.json?$order=published_date DESC&$limit=1000';
const TRAFFIC_API_ENDPOINT = 'https://data.austintexas.gov/resource/dx9v-zd7x.json?$order=published_date DESC&$limit=1000';

async function fetchBroadcastifyLiveCalls(lastPos?: number, init?: boolean): Promise<{ incidents: FireIncident[]; lastPos: number }> {
  try {
    let url = '/api/broadcastify/live-calls';

    if (init) {
      url += '?init=1';
    } else if (lastPos) {
      url += `?pos=${lastPos}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch Broadcastify calls: ${response.statusText}`);
    }

    const data: BroadcastifyResponse = await response.json();

    const dispatchIncidents: FireIncident[] = data.incidents.map(incident => {
      const timestamp = typeof incident.timestamp === 'string'
        ? new Date(incident.timestamp)
        : incident.timestamp;

      return {
        traffic_report_id: incident.id,
        published_date: timestamp.toISOString(),
        issue_reported: incident.callType,
        location: incident.location,
        latitude: incident.location?.coordinates?.[1]?.toString() || '0',
        longitude: incident.location?.coordinates?.[0]?.toString() || '0',
        address: incident.address,
        traffic_report_status: 'ACTIVE' as const,
        traffic_report_status_date_time: timestamp.toISOString(),
        agency: 'Austin Fire Department',
        incidentType: 'dispatch' as const,
        units: incident.units,
        channels: incident.channels,
        audioUrl: incident.audioUrl,
        rawTranscript: incident.rawTranscript,
        estimatedResolutionMinutes: incident.estimatedResolutionMinutes,
      };
    });

    return { incidents: dispatchIncidents, lastPos: data.lastPos };
  } catch (error) {
    console.error('Error fetching Broadcastify calls:', error);
    return { incidents: [], lastPos: lastPos || 0 };
  }
}

export async function fetchFireIncidents(): Promise<FireIncident[]> {
  try {
    const [fireResponse, trafficResponse] = await Promise.all([
      fetch(FIRE_API_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
        },
      }),
      fetch(TRAFFIC_API_ENDPOINT, {
        headers: {
          'Accept': 'application/json',
        },
      })
    ]);

    if (!fireResponse.ok) {
      throw new Error(`Failed to fetch fire incidents: ${fireResponse.statusText}`);
    }
    if (!trafficResponse.ok) {
      throw new Error(`Failed to fetch traffic incidents: ${trafficResponse.statusText}`);
    }

    const [fireData, trafficData] = await Promise.all([
      fireResponse.json(),
      trafficResponse.json()
    ]);

    const fireIncidents: FireIncident[] = (fireData as RawIncidentData[]).map(incident => ({
      ...incident,
      location: incident.location?.type === 'Point'
        ? incident.location as { type: 'Point'; coordinates: [number, number] }
        : {
            type: 'Point' as const,
            coordinates: [parseFloat(incident.longitude), parseFloat(incident.latitude)]
          },
      incidentType: 'fire' as const
    }));

    const trafficIncidents: FireIncident[] = (trafficData as RawIncidentData[]).map(incident => ({
      ...incident,
      location: incident.location?.type === 'Point'
        ? incident.location as { type: 'Point'; coordinates: [number, number] }
        : {
            type: 'Point' as const,
            coordinates: [parseFloat(incident.longitude), parseFloat(incident.latitude)]
          },
      incidentType: 'traffic' as const
    }));

    return [...fireIncidents, ...trafficIncidents];
  } catch (error) {
    console.error('Error fetching incidents:', error);
    throw error;
  }
}

const CACHE_KEY_INCIDENTS = 'dispatch_incidents_cache';
const CACHE_KEY_LASTPOS = 'dispatch_lastpos_cache';

export function useFireIncidents() {
  const [incidents, setIncidents] = useState<FireIncident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const lastPosRef = useRef<number>(0);
  const dispatchIncidentsRef = useRef<FireIncident[]>([]);
  const isInitializedRef = useRef(false);
  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (manual = false, useInit = false) => {
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

      console.log('=== FETCH START ===');
      console.log('Current lastPos:', lastPosRef.current, new Date(lastPosRef.current * 1000).toISOString());
      console.log('Incidents in memory before fetch:', dispatchIncidentsRef.current.length);
      console.log('Using init:', useInit);

      const broadcastifyData = await fetchBroadcastifyLiveCalls(
        useInit ? undefined : lastPosRef.current,
        useInit
      );
      console.log('Broadcastify data received:', {
        lastPos: broadcastifyData.lastPos,
        lastPosDate: new Date(broadcastifyData.lastPos * 1000).toISOString(),
        incidentsCount: broadcastifyData.incidents.length,
        incidentIds: broadcastifyData.incidents.map(i => i.traffic_report_id),
      });

      lastPosRef.current = broadcastifyData.lastPos;

      if (useInit) {
        console.log('Using init - replacing all incidents in memory');
        dispatchIncidentsRef.current = broadcastifyData.incidents;
        console.log('Memory replaced with:', dispatchIncidentsRef.current.length, 'incidents');
      } else if (broadcastifyData.incidents.length > 0) {
        console.log('Adding new dispatch incidents:', broadcastifyData.incidents.length);

        const existingIds = new Set(
          dispatchIncidentsRef.current.map(inc => inc.traffic_report_id)
        );

        console.log('Existing IDs in memory:', Array.from(existingIds));

        const newIncidents = broadcastifyData.incidents.filter(
          inc => !existingIds.has(inc.traffic_report_id)
        );

        console.log('New unique incidents:', newIncidents.length);
        console.log('New incident IDs:', newIncidents.map(i => i.traffic_report_id));

        dispatchIncidentsRef.current = [
          ...newIncidents,
          ...dispatchIncidentsRef.current.slice(0, 50),
        ];

        console.log('Memory after adding:', dispatchIncidentsRef.current.length, 'incidents');
      } else {
        console.log('No new incidents from API');
      }

      console.log('Total dispatch incidents in memory:', dispatchIncidentsRef.current.length);
      console.log('All IDs in memory:', dispatchIncidentsRef.current.map(i => i.traffic_report_id));

      localStorage.setItem(CACHE_KEY_INCIDENTS, JSON.stringify(dispatchIncidentsRef.current));
      localStorage.setItem(CACHE_KEY_LASTPOS, lastPosRef.current.toString());

      // TEMPORARILY DISABLED - only showing Broadcastify dispatch calls
      // const standardIncidents = await fetchFireIncidents();
      // const newData = [...standardIncidents, ...dispatchIncidentsRef.current];

      setIncidents(prevIncidents => {
        console.log('Setting state - previous incidents:', prevIncidents.length);
        console.log('Previous incident IDs:', prevIncidents.map(i => i.traffic_report_id));

        const allIncidents = [...dispatchIncidentsRef.current, ...prevIncidents];
        console.log('Combined before dedup:', allIncidents.length);

        const deduped = Array.from(
          new Map(allIncidents.map(inc => [inc.traffic_report_id, inc])).values()
        );

        console.log('After deduplication:', deduped.length, 'incidents');
        console.log('Final incident IDs:', deduped.map(i => i.traffic_report_id));
        console.log('=== FETCH END ===\n');

        return deduped;
      });

      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
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

      let hasCache = false;
      try {
        const cachedIncidents = localStorage.getItem(CACHE_KEY_INCIDENTS);
        const cachedLastPos = localStorage.getItem(CACHE_KEY_LASTPOS);

        if (cachedIncidents && cachedLastPos) {
          const parsed = JSON.parse(cachedIncidents) as FireIncident[];
          console.log('Loaded from cache:', parsed.length, 'incidents');
          console.log('Cached incident IDs:', parsed.map(i => i.traffic_report_id));
          dispatchIncidentsRef.current = parsed;
          setIncidents(parsed);

          lastPosRef.current = parseInt(cachedLastPos, 10);
          console.log('Loaded lastPos from cache:', lastPosRef.current, new Date(lastPosRef.current * 1000).toISOString());
          hasCache = true;
        } else {
          console.log('No cache found, will use init=1 to fetch last 25 calls');
          lastPosRef.current = 0;
        }
      } catch (error) {
        console.error('Failed to load cache:', error);
      }

      console.log('=== INITIALIZATION END ===\n');

      if (!hasCache) {
        console.log('First load without cache - using init=1');
        fetchData(false, true);
      } else {
        fetchData();
      }
    }

    // TEMPORARILY DISABLED FOR DEBUGGING - only fetch on initial load
    // const standardInterval = setInterval(fetchData, 60 * 1000);
    // return () => {
    //   clearInterval(standardInterval);
    // };
  }, [fetchData]);

  const manualRefetch = useCallback(() => fetchData(true), [fetchData]);

  const fetchInitial = useCallback(() => {
    console.log('=== FETCH INITIAL (LAST 25 CALLS) ===');
    fetchData(true, true);
  }, [fetchData]);

  const setPosition = useCallback((pos: number) => {
    console.log('=== SET POSITION ===');
    console.log('Old position:', lastPosRef.current, new Date(lastPosRef.current * 1000).toISOString());
    console.log('New position:', pos, new Date(pos * 1000).toISOString());

    lastPosRef.current = pos;
    localStorage.setItem(CACHE_KEY_LASTPOS, pos.toString());

    console.log('Position updated in ref and localStorage');
    console.log('=== SET POSITION END ===\n');
  }, []);

  return { incidents, error, lastUpdated, isManualRefresh, refetch: manualRefetch, setPosition, fetchInitial };
}