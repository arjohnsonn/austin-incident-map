import { useState, useEffect, useCallback } from 'react';
import { FireIncident } from '@/types/incident';

// Get data from the last week, ordered by published_date descending (newest first)
const FIRE_API_ENDPOINT = 'https://data.austintexas.gov/resource/wpu4-x69d.json?$order=published_date DESC&$limit=2000';
const TRAFFIC_API_ENDPOINT = 'https://data.austintexas.gov/resource/dx9v-zd7x.json?$order=published_date DESC&$limit=2000';

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

    const fireIncidents = (fireData as any[]).map(incident => ({
      ...incident,
      incidentType: 'fire' as const
    }));

    const trafficIncidents = (trafficData as any[]).map(incident => ({
      ...incident,
      incidentType: 'traffic' as const
    }));

    return [...fireIncidents, ...trafficIncidents];
  } catch (error) {
    console.error('Error fetching incidents:', error);
    throw error;
  }
}

export function useFireIncidents() {
  const [incidents, setIncidents] = useState<FireIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFireIncidents();
      setIncidents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchData]);

  return { incidents, loading, error, refetch: fetchData };
}