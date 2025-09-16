import { useState, useEffect, useCallback } from 'react';
import { FireIncident } from '@/types/incident';

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

// Get recent data, ordered by published_date descending (newest first)
const FIRE_API_ENDPOINT = 'https://data.austintexas.gov/resource/wpu4-x69d.json?$order=published_date DESC&$limit=1000';
const TRAFFIC_API_ENDPOINT = 'https://data.austintexas.gov/resource/dx9v-zd7x.json?$order=published_date DESC&$limit=1000';

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

export function useFireIncidents() {
  const [incidents, setIncidents] = useState<FireIncident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const fetchData = useCallback(async (manual = false) => {
    try {
      setError(null);
      if (manual) {
        setIsManualRefresh(true);
      }
      const newData = await fetchFireIncidents();

      // Smart update: only update if data has actually changed
      setIncidents(prevIncidents => {
        if (prevIncidents.length === 0) {
          return newData;
        }

        const existingMap = new Map(
          prevIncidents.map(incident => [incident.traffic_report_id, incident])
        );

        let hasChanges = false;
        const updatedIncidents = newData.map(newIncident => {
          const existing = existingMap.get(newIncident.traffic_report_id);

          if (!existing) {
            hasChanges = true;
            return newIncident;
          }

          if (
            existing.traffic_report_status !== newIncident.traffic_report_status ||
            existing.traffic_report_status_date_time !== newIncident.traffic_report_status_date_time ||
            existing.published_date !== newIncident.published_date
          ) {
            hasChanges = true;
            return newIncident;
          }

          return existing;
        });

        // Check if any incidents were removed
        if (newData.length !== prevIncidents.length) {
          hasChanges = true;
        }

        // Only update if there are actual changes
        return hasChanges ? updatedIncidents : prevIncidents;
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
    fetchData();

    // Refresh every 1 minute
    const interval = setInterval(fetchData, 1 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const manualRefetch = useCallback(() => fetchData(true), [fetchData]);

  return { incidents, error, lastUpdated, isManualRefresh, refetch: manualRefetch };
}