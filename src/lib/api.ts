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
    } else if (lastPos && lastPos > 0) {
      url += `?pos=${lastPos}`;
    } else {
      url += '?init=1';
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
        incidentType: incident.incidentType,
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
  const [isLoading, setIsLoading] = useState(true);
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

        const dedupById = Array.from(
          new Map(allIncidents.map(inc => [inc.traffic_report_id, inc])).values()
        );

        console.log('\n--- UNIT DEDUPLICATION ACROSS ALL INCIDENTS ---');
        const sortedByTime = [...dedupById].sort((a, b) =>
          new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
        );

        const assignedUnits = new Set<string>();
        const afterUnitDedup: FireIncident[] = [];

        for (const incident of sortedByTime) {
          if (!incident.units || incident.units.length === 0) {
            afterUnitDedup.push(incident);
            continue;
          }

          const availableUnits = incident.units.filter(unit => !assignedUnits.has(unit));

          if (availableUnits.length === 0) {
            console.log(`  → Removing incident ${incident.traffic_report_id} at ${incident.address} (all units reassigned to newer calls)`);
            continue;
          }

          if (availableUnits.length < incident.units.length) {
            const removedUnits = incident.units.filter(unit => assignedUnits.has(unit));
            console.log(`  → Removed units ${removedUnits.join(', ')} from ${incident.traffic_report_id} (reassigned to newer calls)`);
          }

          afterUnitDedup.push({
            ...incident,
            units: availableUnits,
          });

          availableUnits.forEach(unit => assignedUnits.add(unit));
        }

        console.log(`Unit deduplication: ${dedupById.length} → ${afterUnitDedup.length} incidents`);

        const normalizeCallType = (callType: string) => {
          return callType.toLowerCase().replace(/[^a-z0-9]/g, '');
        };

        const seenByCallType = new Map<string, FireIncident[]>();
        const finalDeduped: FireIncident[] = [];

        for (const incident of afterUnitDedup) {
          const normalizedCallType = normalizeCallType(incident.issue_reported);

          if (!seenByCallType.has(normalizedCallType)) {
            seenByCallType.set(normalizedCallType, []);
          }
          seenByCallType.get(normalizedCallType)!.push(incident);
        }

        for (const [, incidents] of seenByCallType.entries()) {
          const incidentsWithAddress = incidents.filter(inc => inc.address && inc.address !== '?');
          const incidentsWithoutAddress = incidents.filter(inc => !inc.address || inc.address === '?');

          const grouped = new Map<string, FireIncident[]>();

          for (const incident of incidentsWithAddress) {
            const normalizedAddress = incident.address.trim().toLowerCase();
            if (!grouped.has(normalizedAddress)) {
              grouped.set(normalizedAddress, []);
            }
            grouped.get(normalizedAddress)!.push(incident);
          }

          for (const [address, addressIncidents] of grouped.entries()) {
            const sorted = addressIncidents.sort((a, b) =>
              new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
            );
            finalDeduped.push(sorted[0]);
          }

          if (incidentsWithoutAddress.length > 0) {
            const allUnitsInAddressedIncidents = new Set<string>();
            for (const incident of incidentsWithAddress) {
              if (incident.units) {
                incident.units.forEach(unit => allUnitsInAddressedIncidents.add(unit));
              }
            }

            for (const incident of incidentsWithoutAddress) {
              if (!incident.units || incident.units.length === 0) {
                continue;
              }

              const hasUniqueUnits = incident.units.some(unit => !allUnitsInAddressedIncidents.has(unit));

              if (hasUniqueUnits) {
                finalDeduped.push(incident);
              }
            }
          }
        }

        console.log('After address+callType deduplication:', finalDeduped.length, 'incidents');

        console.log('\n--- MERGING RELATED INCIDENTS WITH PARTIAL INFORMATION ---');
        const TIME_WINDOW_MS = 5 * 60 * 1000;

        const normalizeAddress = (addr: string | undefined): string => {
          if (!addr || addr === '?') return '';
          return addr
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '');
        };

        const addressesSimilar = (addr1: string | undefined, addr2: string | undefined): boolean => {
          if (!addr1 || !addr2 || addr1 === '?' || addr2 === '?') return false;

          const norm1 = normalizeAddress(addr1);
          const norm2 = normalizeAddress(addr2);

          if (norm1 === norm2) return true;

          if (norm1.includes(norm2) || norm2.includes(norm1)) {
            return true;
          }

          const extractNumbers = (s: string) => s.match(/\d+/g) || [];
          const nums1 = extractNumbers(norm1);
          const nums2 = extractNumbers(norm2);

          if (nums1.length > 0 && nums2.length > 0 && nums1[0] === nums2[0]) {
            const baseAddr1 = norm1.replace(/^\d+/, '');
            const baseAddr2 = norm2.replace(/^\d+/, '');

            if (baseAddr1.includes(baseAddr2) || baseAddr2.includes(baseAddr1)) {
              return true;
            }

            if (baseAddr1 === baseAddr2) return true;
          }

          const extractMainStreet = (s: string) => {
            const lower = s.toLowerCase();
            const words = lower.match(/\b[a-z]+\b/g) || [];
            const mainWords = words.slice(0, 2);
            return mainWords.join('');
          };

          const mainStreet1 = extractMainStreet(addr1);
          const mainStreet2 = extractMainStreet(addr2);

          if (mainStreet1.length >= 6 && mainStreet2.length >= 6 && mainStreet1 === mainStreet2) {
            return true;
          }

          return false;
        };

        for (let i = 0; i < finalDeduped.length; i++) {
          const incident = finalDeduped[i];
          const hasValidCallType = incident.issue_reported && incident.issue_reported !== '?' && incident.issue_reported !== '-';
          const hasValidAddress = incident.address && incident.address !== '?';
          const hasCoordinates = !!(incident.location && incident.location.coordinates && incident.location.coordinates[0] !== 0);

          for (let j = i + 1; j < finalDeduped.length; j++) {
            const other = finalDeduped[j];
            const otherHasValidCallType = other.issue_reported && other.issue_reported !== '?' && other.issue_reported !== '-';
            const otherHasValidAddress = other.address && other.address !== '?';
            const otherHasCoordinates = !!(other.location && other.location.coordinates && other.location.coordinates[0] !== 0);

            const timeDiff = Math.abs(
              new Date(incident.published_date).getTime() - new Date(other.published_date).getTime()
            );

            if (timeDiff > TIME_WINDOW_MS) continue;

            const hasOverlappingUnits = incident.units && other.units &&
              incident.units.some(unit => other.units?.includes(unit));

            const similarAddresses = addressesSimilar(incident.address, other.address);

            const shouldMerge = (timeDiff < 120000 && hasOverlappingUnits) ||
                               (timeDiff < 60000 && similarAddresses);

            if (!shouldMerge) continue;

            let targetIncident = incident;
            let sourceIncident = other;
            let targetIndex = i;
            let sourceIndex = j;

            if (otherHasCoordinates && !hasCoordinates) {
              targetIncident = other;
              sourceIncident = incident;
              targetIndex = j;
              sourceIndex = i;
            }

            if (!targetIncident.issue_reported || targetIncident.issue_reported === '?' || targetIncident.issue_reported === '-') {
              if (sourceIncident.issue_reported && sourceIncident.issue_reported !== '?' && sourceIncident.issue_reported !== '-') {
                console.log(`  → Merging callType "${sourceIncident.issue_reported}" from ${sourceIncident.traffic_report_id} into ${targetIncident.traffic_report_id}`);
                targetIncident.issue_reported = sourceIncident.issue_reported;
              }
            }

            if (!targetIncident.address || targetIncident.address === '?') {
              if (sourceIncident.address && sourceIncident.address !== '?') {
                console.log(`  → Merging address "${sourceIncident.address}" from ${sourceIncident.traffic_report_id} into ${targetIncident.traffic_report_id}`);
                targetIncident.address = sourceIncident.address;
              }
            }

            if (!targetIncident.location || !targetIncident.location.coordinates || targetIncident.location.coordinates[0] === 0) {
              if (sourceIncident.location && sourceIncident.location.coordinates && sourceIncident.location.coordinates[0] !== 0) {
                console.log(`  → Merging coordinates from ${sourceIncident.traffic_report_id} into ${targetIncident.traffic_report_id}`);
                targetIncident.location = sourceIncident.location;
                targetIncident.latitude = sourceIncident.latitude;
                targetIncident.longitude = sourceIncident.longitude;
              }
            }

            if (!targetIncident.units || targetIncident.units.length === 0) {
              if (sourceIncident.units && sourceIncident.units.length > 0) {
                targetIncident.units = sourceIncident.units;
              }
            } else if (sourceIncident.units && sourceIncident.units.length > 0) {
              const combinedUnits = [...new Set([...targetIncident.units, ...sourceIncident.units])];
              targetIncident.units = combinedUnits;
            }

            console.log(`  → Removing duplicate incident ${sourceIncident.traffic_report_id}`);
            finalDeduped.splice(sourceIndex, 1);

            if (sourceIndex < targetIndex) {
              i--;
            }
            j--;
          }
        }

        console.log(`After merging related incidents: ${finalDeduped.length} incidents`);
        console.log('Final incident IDs:', finalDeduped.map(i => i.traffic_report_id));
        console.log('=== FETCH END ===\n');

        return finalDeduped;
      });

      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setIsLoading(false);
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
          setIsLoading(false);

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

    const standardInterval = setInterval(fetchData, 60 * 1000);
    return () => {
      clearInterval(standardInterval);
    };
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

  const resetStorage = useCallback(() => {
    console.log('=== RESET STORAGE ===');

    localStorage.removeItem(CACHE_KEY_INCIDENTS);
    localStorage.removeItem(CACHE_KEY_LASTPOS);

    lastPosRef.current = 0;
    dispatchIncidentsRef.current = [];
    isInitializedRef.current = false;

    setIncidents([]);
    setIsLoading(true);

    console.log('Storage cleared, re-initializing...');

    setTimeout(() => {
      isInitializedRef.current = true;
      fetchData(true, true);
    }, 100);
  }, [fetchData]);

  return { incidents, error, lastUpdated, isManualRefresh, isLoading, refetch: manualRefetch, setPosition, fetchInitial, resetStorage };
}