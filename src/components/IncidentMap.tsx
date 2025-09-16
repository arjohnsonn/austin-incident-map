"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FireIncident } from "@/types/incident";

interface IncidentMapProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
}

export function IncidentMap({
  incidents,
  selectedIncident,
  onIncidentSelect,
}: IncidentMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const { resolvedTheme } = useTheme();

  // Add CSS for pulsing animation and popup styling
  useEffect(() => {
    const style = document.createElement("style");
    const isDark = resolvedTheme === "dark";

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
        background-color: var(--pulse-color, #dc2626);
        animation: pulse-ring 1.5s infinite;
        pointer-events: none;
        z-index: -1;
      }

      .active-fire-marker::before {
        --pulse-color: #dc2626;
      }

      .active-traffic-marker::before {
        --pulse-color: #eab308;
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

  // Get the appropriate map style based on theme
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

    map.current.on("load", () => {
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

    incidents.forEach((incident) => {
      const lng = parseFloat(incident.longitude);
      const lat = parseFloat(incident.latitude);

      // Skip invalid coordinates
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
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();

    // Group incidents by location
    const incidentGroups = groupIncidentsByLocation(incidents);

    // Add markers for each group
    incidentGroups.forEach((group) => {
      const firstIncident = group[0];
      const lng = parseFloat(firstIncident.longitude);
      const lat = parseFloat(firstIncident.latitude);

      const hasActiveIncidents = group.some(
        (inc) => inc.traffic_report_status === "ACTIVE"
      );
      const isCluster = group.length > 1;

      // Determine predominant incident type for cluster coloring
      const fireCount = group.filter(
        (inc) => (inc.incidentType || "fire") === "fire"
      ).length;
      const trafficCount = group.filter(
        (inc) => (inc.incidentType || "fire") === "traffic"
      ).length;
      const predominantType = fireCount >= trafficCount ? "fire" : "traffic";

      // Create marker element
      const markerEl = document.createElement("div");

      if (isCluster) {
        // Cluster marker with count - color based on predominant type
        const colors =
          predominantType === "fire"
            ? {
                bg: "bg-red-600",
                border: "border-red-800",
                pulseClass: "active-fire-marker",
              }
            : {
                bg: "bg-yellow-500",
                border: "border-yellow-700",
                pulseClass: "active-traffic-marker",
              };

        markerEl.className = `relative rounded-full cursor-pointer flex items-center justify-center text-white text-xs font-bold ${
          hasActiveIncidents
            ? `w-6 h-6 ${colors.bg} border-2 ${colors.border} active-marker ${colors.pulseClass}`
            : "w-6 h-6 bg-neutral-600 border-2 border-neutral-800"
        }`;
        markerEl.textContent = group.length.toString();
      } else {
        // Single incident marker
        const incident = firstIncident;
        const isActive = incident.traffic_report_status === "ACTIVE";
        const incidentType = incident.incidentType || "fire";

        if (isActive) {
          const colors =
            incidentType === "fire"
              ? {
                  border: "border-red-600",
                  bg: "bg-red-600",
                  pulseClass: "active-fire-marker",
                }
              : {
                  border: "border-yellow-500",
                  bg: "bg-yellow-500",
                  pulseClass: "active-traffic-marker",
                };

          markerEl.className = `w-4 h-4 rounded-full border-2 cursor-pointer ${colors.border} ${colors.bg} active-marker ${colors.pulseClass}`;
        } else {
          markerEl.className =
            "w-4 h-4 rounded-full border-2 cursor-pointer border-neutral-600 bg-neutral-400";
        }
      }

      // Add hover effects without interfering with positioning
      markerEl.style.transformOrigin = "center center";

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      // Create popup content based on cluster or single incident
      let popupContent = "";

      const isDark = resolvedTheme === "dark";
      const bgColor = isDark ? "#171717" : "white";
      const textColor = isDark ? "white" : "black";
      const neutralTextColor = isDark ? "#9ca3af" : "#6b7280";

      if (isCluster) {
        // Cluster popup showing all incidents
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
        // Single incident popup
        const incident = firstIncident;
        const isActive = incident.traffic_report_status === "ACTIVE";

        popupContent = `
          <div style="background: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 8px; border: 1px solid ${
          isDark ? "#374151" : "#e5e7eb"
        };">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: ${textColor};">${
          incident.issue_reported
        }</div>
            <div style="font-size: 12px; color: ${neutralTextColor}; margin-bottom: 8px;">${
          incident.address
        }</div>
            <div style="font-size: 12px; margin-bottom: 8px;">
              <span style="display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 12px; ${
                isActive
                  ? "background: #fef2f2; color: #991b1b;"
                  : `background: ${isDark ? "#374151" : "#f3f4f6"}; color: ${
                      isDark ? "#d1d5db" : "#374151"
                    };`
              }">
                ${incident.traffic_report_status}
              </span>
            </div>
            <div style="font-size: 12px; color: ${neutralTextColor};">
              ${new Date(incident.published_date).toLocaleString()}
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

      // Event handlers
      let hoverTimeout: NodeJS.Timeout;
      let isClicked = false;

      // Click handler - highest priority
      markerEl.addEventListener("click", (e) => {
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
      markerEl.addEventListener("mouseenter", () => {
        // Don't interfere if recently clicked
        if (isClicked) {
          return;
        }

        // Scale effect - preserve MapLibre's positioning transform
        const beforeTransform = markerEl.style.transform;

        // Extract the positioning part of the transform and add scale
        const positionMatch = beforeTransform.match(
          /translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/
        );
        const positionTransform = positionMatch ? positionMatch[0] : "";

        markerEl.style.transform = `${positionTransform} scale(1.2)`;

        // Popup with delay (only if not clicked)
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          if (!isClicked) {
            popup.addTo(map.current!);
          }
        }, 200);
      });

      markerEl.addEventListener("mouseleave", () => {
        // Don't interfere if recently clicked
        if (isClicked) {
          return;
        }

        // Reset scale - preserve MapLibre's positioning transform
        const beforeTransform = markerEl.style.transform;

        // Extract the positioning part of the transform and reset scale
        const positionMatch = beforeTransform.match(
          /translate\([^)]+\) translate\([^)]+\) rotateX\([^)]+\) rotateZ\([^)]+\)/
        );
        const positionTransform = positionMatch ? positionMatch[0] : "";

        markerEl.style.transform = `${positionTransform} scale(1)`;

        // Remove popup (only if not clicked)
        clearTimeout(hoverTimeout);
        if (!isClicked) {
          popup.remove();
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
