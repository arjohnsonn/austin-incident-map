import { useState, useEffect, useCallback } from 'react';
import { FireIncident } from '@/types/incident';

const API_ENDPOINT = 'https://data.austintexas.gov/resource/wpu4-x69d.json';

export async function fetchFireIncidents(): Promise<FireIncident[]> {
  try {
    const response = await fetch(API_ENDPOINT, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fire incidents: ${response.statusText}`);
    }

    const data = await response.json();
    return data as FireIncident[];
  } catch (error) {
    console.error('Error fetching fire incidents:', error);
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