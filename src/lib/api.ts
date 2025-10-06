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

async function fetchBroadcastifyLiveCalls(lastPos?: number): Promise<{ incidents: FireIncident[]; lastPos: number }> {
  try {
    const url = lastPos
      ? `/api/broadcastify/live-calls?pos=${lastPos}`
      : '/api/broadcastify/live-calls';

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
        latitude: incident.location.coordinates[1].toString(),
        longitude: incident.location.coordinates[0].toString(),
        address: incident.address,
        traffic_report_status: 'ACTIVE' as const,
        traffic_report_status_date_time: timestamp.toISOString(),
        agency: 'Austin Fire Department',
        incidentType: 'dispatch' as const,
        units: incident.units,
        channels: incident.channels,
        audioUrl: incident.audioUrl,
        rawTranscript: incident.rawTranscript,
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

  const fetchData = useCallback(async (manual = false) => {
    try {
      setError(null);
      if (manual) {
        setIsManualRefresh(true);
      }

      console.log('Fetching Broadcastify calls with lastPos:', lastPosRef.current);
      const broadcastifyData = await fetchBroadcastifyLiveCalls(lastPosRef.current);
      console.log('Broadcastify data received:', {
        lastPos: broadcastifyData.lastPos,
        incidentsCount: broadcastifyData.incidents.length,
      });

      lastPosRef.current = broadcastifyData.lastPos;

      if (broadcastifyData.incidents.length > 0) {
        console.log('Adding new dispatch incidents:', broadcastifyData.incidents.length);

        const existingIds = new Set(
          dispatchIncidentsRef.current.map(inc => inc.traffic_report_id)
        );

        const newIncidents = broadcastifyData.incidents.filter(
          inc => !existingIds.has(inc.traffic_report_id)
        );

        console.log('New unique incidents:', newIncidents.length);

        dispatchIncidentsRef.current = [
          ...newIncidents,
          ...dispatchIncidentsRef.current.slice(0, 50),
        ];
      }

      console.log('Total dispatch incidents in memory:', dispatchIncidentsRef.current.length);

      localStorage.setItem(CACHE_KEY_INCIDENTS, JSON.stringify(dispatchIncidentsRef.current));
      localStorage.setItem(CACHE_KEY_LASTPOS, lastPosRef.current.toString());

      // TEMPORARILY DISABLED - only showing Broadcastify dispatch calls
      // const standardIncidents = await fetchFireIncidents();
      // const newData = [...standardIncidents, ...dispatchIncidentsRef.current];

      setIncidents(prevIncidents => {
        const allIncidents = [...dispatchIncidentsRef.current, ...prevIncidents];

        const deduped = Array.from(
          new Map(allIncidents.map(inc => [inc.traffic_report_id, inc])).values()
        );

        return deduped;
      });

      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      if (manual) {
        setTimeout(() => setIsManualRefresh(false), 100);
      }
    }
  }, []);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;

      try {
        const cachedIncidents = localStorage.getItem(CACHE_KEY_INCIDENTS);
        const cachedLastPos = localStorage.getItem(CACHE_KEY_LASTPOS);

        if (cachedIncidents) {
          const parsed = JSON.parse(cachedIncidents) as FireIncident[];
          console.log('Loaded from cache:', parsed.length, 'incidents');
          dispatchIncidentsRef.current = parsed;
          setIncidents(parsed);

          if (cachedLastPos) {
            lastPosRef.current = parseInt(cachedLastPos, 10);
            console.log('Loaded lastPos from cache:', lastPosRef.current);
          }
        } else {
          console.log('No cache found, will fetch all recent calls');
          lastPosRef.current = 0;
        }
      } catch (error) {
        console.error('Failed to load cache:', error);
      }
    }

    fetchData();

    const standardInterval = setInterval(fetchData, 1 * 60 * 1000);

    return () => {
      clearInterval(standardInterval);
    };
  }, [fetchData]);

  const manualRefetch = useCallback(() => fetchData(true), [fetchData]);

  const setPosition = useCallback((pos: number) => {
    lastPosRef.current = pos;
    localStorage.setItem(CACHE_KEY_LASTPOS, pos.toString());
    console.log('Position set to:', pos, new Date(pos * 1000).toISOString());
  }, []);

  return { incidents, error, lastUpdated, isManualRefresh, refetch: manualRefetch, setPosition };
}