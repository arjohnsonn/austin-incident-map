"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useTheme } from "next-themes";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FireIncident } from "@/types/incident";
import { getChannelUrl } from "@/lib/channels";

interface IncidentMapProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
  newIncidentIds?: Set<string>;
}

const EMPTY_SET = new Set<string>();

export function IncidentMap({
  incidents,
  selectedIncident,
  onIncidentSelect,
  newIncidentIds,
}: IncidentMapProps) {
  const stableNewIncidentIds = useMemo(
    () => newIncidentIds || EMPTY_SET,
    [newIncidentIds]
  );
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const style = document.createElement("style");
    const isDark = resolvedTheme === "dark";

    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      @keyframes radar-pulse {
        0% {
          transform: scale(1);
          opacity: 0.7;
        }
        100% {
          transform: scale(4);
          opacity: 0;
        }
      }

      @keyframes marker-flash {
        0%, 20%, 40% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7), 0 0 20px 5px rgba(239, 68, 68, 0.5);
          transform: scale(1.2);
        }
        10%, 30%, 50%, 100% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          transform: scale(1);
        }
      }

      .flash-marker {
        animation: marker-flash 1.5s ease-in-out;
      }


      .radar-ring {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        pointer-events: none;
        animation: radar-pulse 1.5s infinite;
        z-index: -1;
      }

      .fire-radar {
        background-color: #dc2626;
      }

      .medical-radar {
        background-color: #959F1E;
      }

      .traffic-radar {
        background-color: #eab308;
      }

      .user-location-marker {
        width: 16px;
        height: 16px;
        background-color: #3b82f6;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        animation: user-pulse 2s infinite;
        position: relative;
      }

      @keyframes user-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(59, 130, 246, 0.7);
        }
        50% {
          transform: scale(1.1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 10px rgba(59, 130, 246, 0);
        }
      }

      /* Popup styling with maximum specificity */
      .maplibregl-popup.custom-popup .maplibregl-popup-content,
      .custom-popup .maplibregl-popup-content {
        background: ${isDark ? "#171717" : "white"} !important;
        border: 1px solid ${isDark ? "#374151" : "#e5e7eb"} !important;
        border-radius: 8px !important;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
        padding: 0 !important;
        color: ${isDark ? "white" : "black"} !important;
      }

      .maplibregl-popup.custom-popup .maplibregl-popup-tip,
      .custom-popup .maplibregl-popup-tip {
        border-top-color: ${isDark ? "#171717" : "white"} !important;
        border-left-color: transparent !important;
        border-right-color: transparent !important;
        border-bottom-color: transparent !important;
      }

      /* Dark mode text colors */
      ${
        isDark
          ? `
        .custom-popup .maplibregl-popup-content * {
          color: white !important;
        }
        .custom-popup .text-neutral-600 {
          color: #9ca3af !important;
        }
        .custom-popup .text-neutral-500 {
          color: #6b7280 !important;
        }
      `
          : ""
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, [resolvedTheme]);

  const getMapStyle = (currentTheme: string | undefined) => {
    const isDark = currentTheme === "dark";

    return {
      version: 8 as const,
      sources: {
        "osm-tiles": {
          type: "raster" as const,
          tiles: isDark
            ? [
                "https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
                "https://cartodb-basemaps-b.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
                "https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
                "https://cartodb-basemaps-d.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
              ]
            : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: isDark
            ? '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
            : '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: "osm-tiles",
          type: "raster" as const,
          source: "osm-tiles",
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapStyle(resolvedTheme),
      center: [-97.7431, 30.2672], // Austin, TX
      zoom: 10,
    });

    map.current.addControl(new maplibregl.NavigationControl());

    map.current.on("load", () => {
      setMapLoaded(true);
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

  useEffect(() => {
    if (!mapLoaded) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log('User location:', { latitude, longitude });

          if (
            !isNaN(latitude) &&
            !isNaN(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
          ) {
            setUserLocation({ lat: latitude, lng: longitude });
          } else {
            console.warn('Invalid user location coordinates:', { latitude, longitude });
          }
        },
        (error) => {
          console.warn('Error getting user location:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, 
        }
      );
    }
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    map.current.setStyle(getMapStyle(resolvedTheme));
  }, [resolvedTheme, mapLoaded]);

  const groupIncidentsByLocation = (incidents: FireIncident[]) => {
    const groups = new Map<string, FireIncident[]>();

    incidents.forEach((incident) => {
      if (!incident.location || !incident.location.coordinates) {
        return;
      }

      const lng = parseFloat(incident.longitude);
      const lat = parseFloat(incident.latitude);

      if (
        isNaN(lng) ||
        isNaN(lat) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return;
      }

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

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();

    if (userLocation) {
      console.log('Adding user location marker at:', userLocation);

      const userMarkerEl = document.createElement("div");
      userMarkerEl.className = "w-4 h-4 rounded-full border-2 cursor-pointer border-white bg-blue-500 active-marker relative";

      const radarRing = document.createElement("div");
      radarRing.className = "radar-ring";
      radarRing.style.backgroundColor = "#3b82f6"; // blue color
      userMarkerEl.appendChild(radarRing);

      userMarkerEl.style.transformOrigin = "center center";

      const userMarker = new maplibregl.Marker({
        element: userMarkerEl,
        anchor: "center",
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current!);

      markers.current.set("user-location", userMarker);
    }

    const incidentGroups = groupIncidentsByLocation(incidents);

    incidentGroups.forEach((group) => {
      const firstIncident = group[0];
      const lng = parseFloat(firstIncident.longitude);
      const lat = parseFloat(firstIncident.latitude);

      const hasActiveIncidents = group.some(
        (inc) => inc.traffic_report_status === "ACTIVE"
      );
      const isCluster = group.length > 1;
      const hasNewIncident = group.some((inc) =>
        stableNewIncidentIds.has(inc.traffic_report_id)
      );

      const activeIncidents = group.filter(
        (inc) => inc.traffic_report_status === "ACTIVE"
      );
      const activeFireCount = activeIncidents.filter(
        (inc) => inc.incidentType === "fire"
      ).length;
      const activeMedicalCount = activeIncidents.filter(
        (inc) => inc.incidentType === "medical"
      ).length;
      const activeTrafficCount = activeIncidents.filter(
        (inc) => inc.incidentType === "traffic"
      ).length;

      let predominantType: "fire" | "medical" | "traffic" = "fire";
      if (activeIncidents.length > 0) {
        const totalTyped = activeFireCount + activeMedicalCount + activeTrafficCount;
        if (totalTyped === 0) {
          predominantType = "traffic";
        } else if (activeFireCount >= activeMedicalCount && activeFireCount >= activeTrafficCount) {
          predominantType = "fire";
        } else if (activeMedicalCount >= activeFireCount && activeMedicalCount >= activeTrafficCount) {
          predominantType = "medical";
        } else {
          predominantType = "traffic";
        }
      } else {
        const fireCount = group.filter(
          (inc) => inc.incidentType === "fire"
        ).length;
        const medicalCount = group.filter(
          (inc) => inc.incidentType === "medical"
        ).length;
        const trafficCount = group.filter(
          (inc) => inc.incidentType === "traffic"
        ).length;

        const totalTyped = fireCount + medicalCount + trafficCount;
        if (totalTyped === 0) {
          predominantType = "traffic";
        } else if (fireCount >= medicalCount && fireCount >= trafficCount) {
          predominantType = "fire";
        } else if (medicalCount >= fireCount && medicalCount >= trafficCount) {
          predominantType = "medical";
        } else {
          predominantType = "traffic";
        }
      }

      const markerEl = document.createElement("div");

      if (isCluster) {
        const colors =
          predominantType === "fire"
            ? {
                bg: "bg-red-600",
                border: "border-red-800",
              }
            : predominantType === "medical"
            ? {
                bg: "bg-[#959F1E]",
                border: "border-[#7a8218]",
              }
            : {
                bg: "bg-yellow-500",
                border: "border-yellow-700",
              };

        markerEl.className = `relative rounded-full cursor-pointer flex items-center justify-center text-white text-xs font-bold ${
          hasActiveIncidents
            ? `w-6 h-6 ${colors.bg} border-2 ${colors.border} active-marker`
            : "w-6 h-6 bg-neutral-600 border-2 border-neutral-800"
        } ${hasNewIncident ? 'flash-marker' : ''}`;
        markerEl.textContent = group.length.toString();

        if (hasActiveIncidents) {
          const radarRing = document.createElement("div");
          const radarClass = predominantType === "fire" ? "fire-radar" : predominantType === "medical" ? "medical-radar" : "traffic-radar";
          radarRing.className = `radar-ring ${radarClass}`;
          markerEl.appendChild(radarRing);
        }
      } else {
        const incident = firstIncident;
        const isActive = incident.traffic_report_status === "ACTIVE";
        const incidentType = incident.incidentType;

        if (isActive) {
          const colors =
            incidentType === "fire"
              ? "border-red-600 bg-red-600"
              : incidentType === "medical"
              ? "border-[#959F1E] bg-[#959F1E]"
              : "border-yellow-500 bg-yellow-500";

          markerEl.className = `w-4 h-4 rounded-full border-2 cursor-pointer ${colors} active-marker relative ${hasNewIncident ? 'flash-marker' : ''}`;

          const radarRing = document.createElement("div");
          const radarClass = incidentType === "fire" ? "fire-radar" : incidentType === "medical" ? "medical-radar" : "traffic-radar";
          radarRing.className = `radar-ring ${radarClass}`;
          markerEl.appendChild(radarRing);
        } else {
          markerEl.className =
            `w-4 h-4 rounded-full border-2 cursor-pointer border-neutral-600 bg-neutral-400 ${hasNewIncident ? 'flash-marker' : ''}`;
        }
      }

      markerEl.style.transformOrigin = "center center";

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      let popupContent = "";

      const isDark = resolvedTheme === "dark";
      const bgColor = isDark ? "#171717" : "white";
      const textColor = isDark ? "white" : "black";
      const neutralTextColor = isDark ? "#9ca3af" : "#6b7280";

      if (isCluster) {
        const activeCount = group.filter(
          (inc) => inc.traffic_report_status === "ACTIVE"
        ).length;
        const archivedCount = group.length - activeCount;

        popupContent = `
          <div style="background: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 8px; border: 1px solid ${
          isDark ? "#374151" : "#e5e7eb"
        };">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: ${textColor};">${
          group.length
        } Incidents at this location</div>
            <div style="font-size: 12px; margin-bottom: 8px;">
              ${
                activeCount > 0
                  ? `<span style="display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 12px; background: #fef2f2; color: #991b1b; margin-right: 4px;">${activeCount} Active</span>`
                  : ""
              }
              ${
                archivedCount > 0
                  ? `<span style="display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 12px; background: #f3f4f6; color: #374151;">${archivedCount} Archived</span>`
                  : ""
              }
            </div>
            <div style="font-size: 12px; color: ${neutralTextColor}; margin-bottom: 8px;">${
          firstIncident.address
        }</div>
            <div style="max-height: 128px; overflow-y: auto;">
              ${group
                .map(
                  (inc) => `
                <div style="font-size: 12px; padding: 4px; border: 1px solid ${
                  isDark ? "#374151" : "#e5e7eb"
                }; border-radius: 4px; margin-bottom: 4px; background: ${
                    isDark ? "#374151" : "#f9fafb"
                  };">
                  <div style="font-weight: 500; color: ${textColor};">${
                    inc.issue_reported
                  }</div>
                  <div style="color: ${neutralTextColor};">${new Date(
                    inc.published_date
                  ).toLocaleString()}</div>
                </div>
              `
                )
                .join("")}
            </div>
            <div style="font-size: 12px; color: ${neutralTextColor}; margin-top: 8px;">Click to select first incident</div>
          </div>
        `;
      } else {
        const incident = firstIncident;
        const formatDate = (dateString: string) => {
          try {
            const date = new Date(dateString);
            return date.toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          } catch {
            return "Invalid date";
          }
        };

        const hasAudio = !!incident.audioUrl;
        const units = incident.units && incident.units.length > 0
          ? incident.units.join(', ')
          : '-';
        const channels = incident.channels && incident.channels.length > 0
          ? incident.channels.map((channel, idx) => {
              const url = getChannelUrl(channel);
              const separator = idx > 0 ? ', ' : '';
              return url
                ? `${separator}<a href="${url}" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: inherit;">${channel}</a>`
                : `${separator}${channel}`;
            }).join('')
          : '-';

        popupContent = `
          <div style="background: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 8px; border: 1px solid ${
          isDark ? "#374151" : "#e5e7eb"
        }; min-width: 280px;">
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; font-size: 12px;">
              ${hasAudio ? `
                <div style="display: flex; align-items: center; justify-content: center; color: ${neutralTextColor};">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              ` : '<div style="width: 12px;"></div>'}

              <div style="color: ${neutralTextColor}; font-family: monospace;">
                ${formatDate(incident.published_date)}
              </div>

              <div></div>
              <div style="font-weight: 600; color: ${textColor};">
                ${incident.issue_reported}
              </div>

              <div></div>
              <div style="color: ${neutralTextColor};">
                ${incident.address || '?'}
              </div>

              <div></div>
              <div style="color: #3b82f6; font-size: 11px;">
                <strong>Units:</strong> ${units}
              </div>

              <div></div>
              <div style="color: #a855f7; font-size: 11px;">
                <strong>Channels:</strong> ${channels}
              </div>
            </div>
          </div>
        `;
      }

      const popup = new maplibregl.Popup({
        offset: 20,
        closeButton: false,
        maxWidth: "300px",
        className: "custom-popup",
      })
        .setLngLat([lng, lat])
        .setHTML(popupContent);

      let hoverTimeout: NodeJS.Timeout;
      let isClicked = false;

      markerEl.addEventListener("click", (e) => {
        e.stopPropagation();
        isClicked = true;

        clearTimeout(hoverTimeout);

        onIncidentSelect(firstIncident);

        popup.addTo(map.current!);

        setTimeout(() => {
          isClicked = false;
        }, 100);
      });

      markerEl.addEventListener("mouseenter", () => {
        if (isClicked) {
          return;
        }

        const beforeTransform = markerEl.style.transform;

        const positionMatch = beforeTransform.match(
          /translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/
        );
        const positionTransform = positionMatch ? positionMatch[0] : "";

        markerEl.style.transform = `${positionTransform} scale(1.2)`;

        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          if (!isClicked) {
            popup.addTo(map.current!);
          }
        }, 200);
      });

      markerEl.addEventListener("mouseleave", () => {
        if (isClicked) {
          return;
        }

        const beforeTransform = markerEl.style.transform;

        const positionMatch = beforeTransform.match(
          /translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/
        );
        const positionTransform = positionMatch ? positionMatch[0] : "";

        markerEl.style.transform = `${positionTransform} scale(1)`;

        clearTimeout(hoverTimeout);
        if (!isClicked) {
          popup.remove();
        }
      });

      const markerId = isCluster
        ? `cluster_${lng}_${lat}`
        : firstIncident.traffic_report_id;
      markers.current.set(markerId, marker);
    });
  }, [incidents, selectedIncident, onIncidentSelect, mapLoaded, resolvedTheme, userLocation, stableNewIncidentIds]);

  useEffect(() => {
    if (!map.current || !selectedIncident) return;

    const lng = parseFloat(selectedIncident.longitude);
    const lat = parseFloat(selectedIncident.latitude);

    if (
      isNaN(lng) ||
      isNaN(lat) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
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
        style={{ height: "100%", width: "100%" }}
      />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
          <div className="text-lg">Loading map...</div>
        </div>
      )}
    </div>
  );
}
