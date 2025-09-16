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
  const { theme, resolvedTheme } = useTheme();

  // Get the appropriate map style based on theme
  const getMapStyle = (currentTheme: string | undefined) => {
    const isDark = currentTheme === 'dark';

    return {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
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
          type: 'raster',
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
  }, [resolvedTheme]);

  // Update map style when theme changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    map.current.setStyle(getMapStyle(resolvedTheme));
  }, [resolvedTheme, mapLoaded, getMapStyle]);

  // Add/update markers when incidents change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current.clear();

    // Add new markers
    incidents.forEach(incident => {
      const lng = parseFloat(incident.longitude);
      const lat = parseFloat(incident.latitude);

      // Validate coordinates
      if (isNaN(lng) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return;
      }

      const isActive = incident.traffic_report_status === 'ACTIVE';
      const isSelected = selectedIncident?.traffic_report_id === incident.traffic_report_id;

      // Create marker element
      const markerEl = document.createElement('div');
      markerEl.className = `w-3 h-3 rounded-full border-2 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-600 bg-blue-200 scale-150'
          : isActive
          ? 'border-red-600 bg-red-400 hover:scale-125'
          : 'border-gray-600 bg-gray-400 hover:scale-110'
      }`;

      const marker = new maplibregl.Marker(markerEl)
        .setLngLat([lng, lat])
        .addTo(map.current!);

      // Add click handler
      markerEl.addEventListener('click', () => {
        onIncidentSelect(incident);
      });

      // Add popup
      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div class="p-2">
          <div class="font-semibold text-sm">${incident.issue_reported}</div>
          <div class="text-xs text-gray-600">${incident.address}</div>
          <div class="text-xs mt-1">
            <span class="inline-block px-2 py-1 rounded-full text-xs ${
              isActive ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
            }">
              ${incident.traffic_report_status}
            </span>
          </div>
          <div class="text-xs text-gray-500 mt-1">
            ${new Date(incident.published_date).toLocaleString()}
          </div>
        </div>
      `);

      marker.setPopup(popup);
      markers.current.set(incident.traffic_report_id, marker);
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