'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FireIncident } from '@/types/incident';

interface FireMapProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
}

export function FireMap({ incidents, selectedIncident, onIncidentSelect }: FireMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const { resolvedTheme } = useTheme();

  // Add CSS for pulsing animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse-ring {
        0% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.7;
        }
        100% {
          transform: translate(-50%, -50%) scale(4);
          opacity: 0;
        }
      }

      .active-marker {
        position: relative;
      }

      .active-marker::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: #dc2626;
        animation: pulse-ring 1.5s infinite;
        pointer-events: none;
        z-index: -1;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Get the appropriate map style based on theme
  const getMapStyle = (currentTheme: string | undefined) => {
    const isDark = currentTheme === 'dark';

    return {
      version: 8 as const,
      sources: {
        'osm-tiles': {
          type: 'raster' as const,
          tiles: isDark
            ? [
                'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
                'https://cartodb-basemaps-b.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
                'https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
                'https://cartodb-basemaps-d.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
              ]
            : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: isDark
            ? '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles',
          type: 'raster' as const,
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(resolvedTheme),
      center: [-97.7431, 30.2672], // Austin, TX
      zoom: 10,
    });

    map.current.addControl(new maplibregl.NavigationControl());

    map.current.on('load', () => {
      setMapLoaded(true);
      // Force resize to ensure proper rendering
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 100);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map style when theme changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    map.current.setStyle(getMapStyle(resolvedTheme));
  }, [resolvedTheme, mapLoaded]);

  // Group incidents by location to handle clustering
  const groupIncidentsByLocation = (incidents: FireIncident[]) => {
    const groups = new Map<string, FireIncident[]>();

    incidents.forEach(incident => {
      const lng = parseFloat(incident.longitude);
      const lat = parseFloat(incident.latitude);

      // Skip invalid coordinates
      if (isNaN(lng) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return;
      }

      // Round coordinates to avoid tiny differences
      const roundedLng = Math.round(lng * 10000) / 10000;
      const roundedLat = Math.round(lat * 10000) / 10000;
      const key = `${roundedLat},${roundedLng}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(incident);
    });

    return Array.from(groups.values());
  };

  // Add/update markers when incidents change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current.clear();

    // Group incidents by location
    const incidentGroups = groupIncidentsByLocation(incidents);

    // Add markers for each group
    incidentGroups.forEach(group => {
      const firstIncident = group[0];
      const lng = parseFloat(firstIncident.longitude);
      const lat = parseFloat(firstIncident.latitude);

      const hasActiveIncidents = group.some(inc => inc.traffic_report_status === 'ACTIVE');
      const isCluster = group.length > 1;

      // Create marker element
      const markerEl = document.createElement('div');

      if (isCluster) {
        // Cluster marker with count
        markerEl.className = `relative rounded-full cursor-pointer flex items-center justify-center text-white text-xs font-bold ${
          hasActiveIncidents
            ? 'w-6 h-6 bg-red-600 border-2 border-red-800 active-marker'
            : 'w-6 h-6 bg-gray-600 border-2 border-gray-800'
        }`;
        markerEl.textContent = group.length.toString();
      } else {
        // Single incident marker
        const incident = firstIncident;
        const isActive = incident.traffic_report_status === 'ACTIVE';

        markerEl.className = `w-4 h-4 rounded-full border-2 cursor-pointer ${
          isActive
            ? 'border-red-600 bg-red-600 active-marker'
            : 'border-gray-600 bg-gray-400'
        }`;
      }

      // Add hover effects without interfering with positioning
      markerEl.style.transformOrigin = 'center center';

      console.log('🎯 Creating marker:', {
        position: { lng, lat },
        isCluster,
        groupSize: group.length,
        element: markerEl.className,
        transformOrigin: markerEl.style.transformOrigin
      });

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: 'center'
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      console.log('✅ Marker created successfully');

      // Create popup content based on cluster or single incident
      let popupContent = '';

      if (isCluster) {
        // Cluster popup showing all incidents
        const activeCount = group.filter(inc => inc.traffic_report_status === 'ACTIVE').length;
        const archivedCount = group.length - activeCount;

        popupContent = `
          <div class="p-3">
            <div class="font-semibold text-sm mb-2">${group.length} Incidents at this location</div>
            <div class="text-xs mb-2">
              ${activeCount > 0 ? `<span class="inline-block px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 mr-1">${activeCount} Active</span>` : ''}
              ${archivedCount > 0 ? `<span class="inline-block px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">${archivedCount} Archived</span>` : ''}
            </div>
            <div class="text-xs text-gray-600 mb-2">${firstIncident.address}</div>
            <div class="max-h-32 overflow-y-auto space-y-1">
              ${group.map(inc => `
                <div class="text-xs p-1 border rounded">
                  <div class="font-medium">${inc.issue_reported}</div>
                  <div class="text-gray-500">${new Date(inc.published_date).toLocaleString()}</div>
                </div>
              `).join('')}
            </div>
            <div class="text-xs text-gray-500 mt-2">Click to select first incident</div>
          </div>
        `;
      } else {
        // Single incident popup
        const incident = firstIncident;
        const isActive = incident.traffic_report_status === 'ACTIVE';

        popupContent = `
          <div class="p-3">
            <div class="font-semibold text-sm mb-1">${incident.issue_reported}</div>
            <div class="text-xs text-gray-600 mb-2">${incident.address}</div>
            <div class="text-xs mb-2">
              <span class="inline-block px-2 py-1 rounded-full text-xs ${
                isActive ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
              }">
                ${incident.traffic_report_status}
              </span>
            </div>
            <div class="text-xs text-gray-500">
              ${new Date(incident.published_date).toLocaleString()}
            </div>
          </div>
        `;
      }

      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: false,
        maxWidth: '300px',
        className: 'custom-popup'
      })
        .setLngLat([lng, lat])
        .setHTML(popupContent);

      console.log('🎪 Popup created:', {
        position: [lng, lat],
        contentLength: popupContent.length,
        hasContent: popupContent.trim().length > 0,
        isCluster,
        groupSize: group.length
      });

      // Event handlers
      let hoverTimeout: NodeJS.Timeout;
      let isClicked = false;

      // Click handler - highest priority
      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        isClicked = true;

        // Clear any hover timeout
        clearTimeout(hoverTimeout);

        // For clusters, select the first incident
        // For single incidents, select that incident
        onIncidentSelect(firstIncident);

        // Show popup immediately on click
        popup.addTo(map.current!);

        // Reset click flag after a short delay
        setTimeout(() => {
          isClicked = false;
        }, 100);
      });

      // Hover handlers
      markerEl.addEventListener('mouseenter', () => {
        console.log('🔍 HOVER ENTER:', {
          isClicked,
          currentTransform: markerEl.style.transform,
          position: { lng, lat },
          markerId: isCluster ? `cluster_${lng}_${lat}` : firstIncident.traffic_report_id
        });

        // Don't interfere if recently clicked
        if (isClicked) {
          console.log('❌ Skipping hover - recently clicked');
          return;
        }

        // Scale effect - preserve MapLibre's positioning transform
        const beforeTransform = markerEl.style.transform;

        // Extract the positioning part of the transform and add scale
        const positionMatch = beforeTransform.match(/translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/);
        const positionTransform = positionMatch ? positionMatch[0] : '';

        markerEl.style.transform = `${positionTransform} scale(1.2)`;
        console.log('📐 Transform change:', {
          before: beforeTransform,
          after: markerEl.style.transform,
          positionPart: positionTransform,
          computedTransform: window.getComputedStyle(markerEl).transform,
          offsetPosition: { left: markerEl.offsetLeft, top: markerEl.offsetTop }
        });

        // Popup with delay (only if not clicked)
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          if (!isClicked) {
            console.log('💬 Adding popup to map:', {
              mapExists: !!map.current,
              popupElement: popup.getElement(),
              popupLngLat: popup.getLngLat()
            });
            popup.addTo(map.current!);
            console.log('💬 Popup added, isOpen:', popup.isOpen());
          } else {
            console.log('💬 Skipping popup - was clicked');
          }
        }, 200); // Reduced delay from 300ms to 200ms
      });

      markerEl.addEventListener('mouseleave', () => {
        console.log('🔍 HOVER LEAVE:', {
          isClicked,
          currentTransform: markerEl.style.transform
        });

        // Don't interfere if recently clicked
        if (isClicked) {
          console.log('❌ Skipping leave - recently clicked');
          return;
        }

        // Reset scale - preserve MapLibre's positioning transform
        const beforeTransform = markerEl.style.transform;

        // Extract the positioning part of the transform and reset scale
        const positionMatch = beforeTransform.match(/translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/);
        const positionTransform = positionMatch ? positionMatch[0] : '';

        markerEl.style.transform = `${positionTransform} scale(1)`;
        console.log('📐 Reset transform:', {
          before: beforeTransform,
          after: markerEl.style.transform,
          positionPart: positionTransform,
          computedTransform: window.getComputedStyle(markerEl).transform,
          offsetPosition: { left: markerEl.offsetLeft, top: markerEl.offsetTop }
        });

        // Remove popup (only if not clicked)
        clearTimeout(hoverTimeout);
        if (!isClicked) {
          console.log('💬 Removing popup, was open:', popup.isOpen());
          popup.remove();
          console.log('💬 Popup removed, still open:', popup.isOpen());
        } else {
          console.log('💬 Not removing popup - was clicked');
        }
      });

      // Store marker with group identifier
      const markerId = isCluster
        ? `cluster_${lng}_${lat}`
        : firstIncident.traffic_report_id;
      markers.current.set(markerId, marker);
    });
  }, [incidents, selectedIncident, onIncidentSelect, mapLoaded]);

  // Fly to selected incident
  useEffect(() => {
    if (!map.current || !selectedIncident) return;

    const lng = parseFloat(selectedIncident.longitude);
    const lat = parseFloat(selectedIncident.latitude);

    // Validate coordinates
    if (isNaN(lng) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    map.current.flyTo({
      center: [lng, lat],
      zoom: 15,
      duration: 1000,
    });
  }, [selectedIncident]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ height: '100%', width: '100%' }}
      />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="text-lg">Loading map...</div>
        </div>
      )}
    </div>
  );
}