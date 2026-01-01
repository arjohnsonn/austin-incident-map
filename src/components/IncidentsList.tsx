"use client";

import { useState, useMemo, memo, useRef, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Search, Calendar, RefreshCw, Play, Pause, Trash2, Volume2, AlertTriangle, Filter, Download } from "lucide-react";
import { ExportPopover } from "@/components/ExportPopover";
import { useSettings } from "@/lib/settings";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { IncidentCard } from "@/components/IncidentCard";
import { getChannelUrl } from "@/lib/channels";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  FireIncident,
  FilterState,
  IncidentStatus,
  DateRange,
} from "@/types/incident";
import { removeUnitsFromOlderIncidents } from "@/lib/api";

interface IncidentsListProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
  onDisplayedIncidentsChange?: (incidents: FireIncident[]) => void;
  onNewIncident?: (incident: FireIncident, newIds: Set<string>) => void;
  onAudioStateChange?: (playing: boolean) => void;
  loading?: boolean;
  isInitialFetchComplete?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  onResetStorage?: () => void;
}

const ITEM_HEIGHT = 32;
const BUFFER_SIZE = 10;

const VirtualizedList = memo(
  ({
    incidents,
    allIncidents,
    selectedIncident,
    onIncidentSelect,
    autoPlayAudio,
    showDownloadButton,
    onNewIncident,
    onAudioStateChange,
    loading,
    isInitialFetchComplete,
  }: {
    incidents: FireIncident[];
    allIncidents: FireIncident[];
    selectedIncident: FireIncident | null;
    onIncidentSelect: (incident: FireIncident) => void;
    autoPlayAudio: boolean;
    showDownloadButton: boolean;
    onNewIncident?: (incident: FireIncident, newIds: Set<string>) => void;
    onAudioStateChange?: (playing: boolean) => void;
    loading?: boolean;
    isInitialFetchComplete?: boolean;
  }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playPromiseRef = useRef<Promise<void> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [newIncidentIds, setNewIncidentIds] = useState<Set<string>>(new Set());
    const prevIncidentIdsRef = useRef<Set<string>>(new Set());
    const isInitializedRef = useRef(false);
    const [columnWidths, setColumnWidths] = useState({
      play: 32,
      time: 80,
      callType: 168,
      address: 192,
      units: 140,
      channels: 110,
    });
    const [isResizing, setIsResizing] = useState(false);
    const resizingColumn = useRef<string | null>(null);
    const startX = useRef<number>(0);
    const startWidth = useRef<number>(0);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateHeight = () => {
        setContainerHeight(container.clientHeight);
      };

      updateHeight();
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(container);

      return () => resizeObserver.disconnect();
    }, []);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent, column: string) => {
      e.preventDefault();
      e.stopPropagation();
      resizingColumn.current = column;
      startX.current = e.clientX;
      startWidth.current = columnWidths[column as keyof typeof columnWidths];
      setIsResizing(true);
    }, [columnWidths]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
      if (!resizingColumn.current) return;
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn.current!]: newWidth,
      }));
    }, []);

    const handleResizeEnd = useCallback(() => {
      resizingColumn.current = null;
      setIsResizing(false);
    }, []);

    useEffect(() => {
      if (isResizing) {
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        return () => {
          document.removeEventListener('mousemove', handleResizeMove);
          document.removeEventListener('mouseup', handleResizeEnd);
        };
      }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    const formatDate = (dateString: string) => {
      try {
        return format(new Date(dateString), "MM/dd HH:mm");
      } catch {
        return "Invalid date";
      }
    };

    const handlePlayAudio = useCallback(async (e: React.MouseEvent, incident: FireIncident) => {
      e.stopPropagation();

      if (!incident.audioUrl) return;

      if (playingAudioId === incident.traffic_report_id) {
        if (playPromiseRef.current) {
          await playPromiseRef.current.catch(() => {});
        }
        audioRef.current?.pause();
        playPromiseRef.current = null;
        setPlayingAudioId(null);
        onAudioStateChange?.(false);
      } else {
        if (audioRef.current) {
          if (playPromiseRef.current) {
            await playPromiseRef.current.catch(() => {});
          }
          audioRef.current.pause();
        }

        audioRef.current = new Audio(incident.audioUrl);
        playPromiseRef.current = audioRef.current.play().catch((error) => {
          console.error('Playback failed:', error);
        });
        setPlayingAudioId(incident.traffic_report_id);
        onAudioStateChange?.(true);

        audioRef.current.onended = () => {
          playPromiseRef.current = null;
          setPlayingAudioId(null);
          onAudioStateChange?.(false);
        };
      }
    }, [playingAudioId, onAudioStateChange]);

    const handleDownloadAudio = useCallback((e: React.MouseEvent, incident: FireIncident) => {
      e.stopPropagation();
      if (!incident.audioUrl) return;

      const timestamp = format(new Date(incident.published_date), "yyyy-MM-dd_HHmm");
      const callType = incident.issue_reported?.replace(/[^a-zA-Z0-9]/g, '_') || 'dispatch';
      const filename = `${timestamp}_${callType}.mp3`;

      const link = document.createElement('a');
      link.href = incident.audioUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, []);

    useEffect(() => {
      return () => {
        if (playPromiseRef.current) {
          playPromiseRef.current.then(() => {
            audioRef.current?.pause();
          }).catch(() => {});
        } else if (audioRef.current) {
          audioRef.current.pause();
        }
        onAudioStateChange?.(false);
      };
    }, [onAudioStateChange]);

    useEffect(() => {
      const currentIds = new Set(allIncidents.map(inc => inc.traffic_report_id));

      if (!isInitializedRef.current) {
        if (isInitialFetchComplete) {
          isInitializedRef.current = true;
          prevIncidentIdsRef.current = currentIds;
        }
        return;
      }

      const newIds = new Set<string>();

      currentIds.forEach(id => {
        if (!prevIncidentIdsRef.current.has(id)) {
          newIds.add(id);
        }
      });

      if (newIds.size > 0) {
        setNewIncidentIds(newIds);

        const newIncidentsArray = allIncidents.filter(inc => newIds.has(inc.traffic_report_id));

        if (newIncidentsArray.length > 0) {
          const mostRecentIncident = newIncidentsArray.sort(
            (a, b) => new Date(b.published_date).getTime() - new Date(a.published_date).getTime()
          )[0];

          if (onNewIncident) {
            onNewIncident(mostRecentIncident, newIds);
          }

          if (autoPlayAudio && mostRecentIncident.audioUrl) {
            const playNewAudio = async () => {
              if (audioRef.current) {
                if (playPromiseRef.current) {
                  await playPromiseRef.current.catch(() => {});
                }
                audioRef.current.pause();
              }

              audioRef.current = new Audio(mostRecentIncident.audioUrl);
              playPromiseRef.current = audioRef.current.play().then(() => {
                onAudioStateChange?.(true);
              }).catch((error) => {
                console.error('Auto-play failed:', error);
                console.log('Browser blocked auto-play. User interaction required.');
              });
              setPlayingAudioId(mostRecentIncident.traffic_report_id);

              audioRef.current.onended = () => {
                playPromiseRef.current = null;
                setPlayingAudioId(null);
                onAudioStateChange?.(false);
              };
            };

            playNewAudio();
          }
        }

        const timer = setTimeout(() => {
          setNewIncidentIds(new Set());
        }, 3000);

        prevIncidentIdsRef.current = currentIds;
        return () => clearTimeout(timer);
      } else {
        prevIncidentIdsRef.current = currentIds;
      }
    }, [allIncidents, autoPlayAudio, onNewIncident, onAudioStateChange, isInitialFetchComplete]);


    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE
    );
    const endIndex = Math.min(
      incidents.length - 1,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
    );

    const visibleItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const incident = incidents[i];
      const isSelected =
        selectedIncident?.traffic_report_id === incident.traffic_report_id;
      const isNew = newIncidentIds.has(incident.traffic_report_id);
      const hasStagingInstructions = incident.rawTranscript?.toLowerCase().includes("check for possible staging instructions");

      visibleItems.push(
        <div
          key={`${incident.traffic_report_id}-${i}`}
          className={`absolute left-0 right-0 cursor-pointer transition-colors border-b border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 min-w-[800px] ${
            isSelected
              ? "bg-blue-200 dark:bg-blue-800"
              : hasStagingInstructions
              ? "bg-red-50 dark:bg-red-950/30"
              : i % 2 === 0
              ? "bg-neutral-50 dark:bg-neutral-900"
              : "bg-white dark:bg-neutral-800"
          } ${isNew ? 'animate-new-incident' : ''}`}
          style={
            {
              "--item-top": `${i * ITEM_HEIGHT}px`,
              "--item-height": `${ITEM_HEIGHT}px`,
              top: "var(--item-top)",
              height: "var(--item-height)",
            } as React.CSSProperties
          }
          onClick={() => onIncidentSelect(incident)}
        >
          <div className="flex items-center h-full px-2 text-xs relative">
            <div style={{ width: columnWidths.play }} className="flex items-center justify-center flex-shrink-0 gap-0.5">
              {incident.audioUrl ? (
                <>
                  <button
                    onClick={(e) => handlePlayAudio(e, incident)}
                    className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-colors"
                    title="Play dispatch audio"
                  >
                    {playingAudioId === incident.traffic_report_id ? (
                      <Pause className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Play className="w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                    )}
                  </button>
                  {showDownloadButton && (
                    <button
                      onClick={(e) => handleDownloadAudio(e, incident)}
                      className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-full transition-colors"
                      title="Download audio"
                    >
                      <Download className="w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                    </button>
                  )}
                </>
              ) : (
                <div className="w-3 h-3" />
              )}
            </div>
            <div style={{ width: columnWidths.time }} className="text-center text-neutral-500 dark:text-neutral-400 font-mono flex-shrink-0">
              {formatDate(incident.published_date)}
            </div>
            <div style={{ width: columnWidths.callType }} className="px-2 truncate font-medium flex-shrink-0 relative group">
              {incident.issue_reported}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => handleResizeStart(e, 'callType')}
              />
            </div>
            <div style={{ width: columnWidths.address }} className="px-2 truncate text-neutral-600 dark:text-neutral-400 flex-shrink-0 relative group">
              {(() => {
                const hasValidCoords = incident.location?.coordinates &&
                  incident.location.coordinates[0] !== 0 &&
                  incident.location.coordinates[1] !== 0;

                if (!incident.location) return '?';
                if (!hasValidCoords) return `${incident.address} (?)`;
                return incident.address;
              })()}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => handleResizeStart(e, 'address')}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div style={{ width: columnWidths.units }} className="px-2 truncate text-blue-600 dark:text-blue-400 text-xs flex-shrink-0 relative group cursor-help">
                  {incident.units && incident.units.length > 0
                    ? incident.units.join(', ')
                    : '-'}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                    onMouseDown={(e) => handleResizeStart(e, 'units')}
                  />
                </div>
              </TooltipTrigger>
              {incident.units && incident.units.length > 0 && (
                <TooltipContent>
                  <div className="font-semibold mb-1">Responding Units:</div>
                  <div className="space-y-0.5">
                    {incident.units.map((unit, idx) => (
                      <div key={idx}>{unit}</div>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
            <div style={{ width: columnWidths.channels }} className="px-2 truncate text-purple-600 dark:text-purple-400 text-xs flex-shrink-0 relative group">
              {incident.channels && incident.channels.length > 0 ? (
                <span>
                  {incident.channels.map((channel, idx) => {
                    const url = getChannelUrl(channel);
                    return (
                      <span key={channel}>
                        {idx > 0 && ", "}
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:text-purple-700 dark:hover:text-purple-300"
                          >
                            {channel}
                          </a>
                        ) : (
                          channel
                        )}
                      </span>
                    );
                  })}
                </span>
              ) : (
                '-'
              )}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => handleResizeStart(e, 'channels')}
              />
            </div>
          </div>
        </div>
      );
    }


    return (
      <div className="flex flex-col h-full">
        <div
          ref={containerRef}
          className="flex-1 overflow-auto overflow-x-auto"
          onScroll={handleScroll}
        >
          {/* Table Header - now inside scrollable area */}
          <div className="bg-neutral-200 dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs font-bold px-2 py-2 border-b-2 border-neutral-300 dark:border-neutral-600 sticky top-0 z-10 min-w-[800px]">
            <div className="flex items-center">
              <div style={{ width: columnWidths.play }} className="text-center flex-shrink-0 flex items-center justify-center">
                <Volume2 className="w-3 h-3" />
              </div>
              <div style={{ width: columnWidths.time }} className="text-center flex-shrink-0">
                TIME
              </div>
              <div style={{ width: columnWidths.callType }} className="px-2 flex-shrink-0 relative">
                CALL TYPE
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-neutral-400 dark:bg-neutral-700"
                  onMouseDown={(e) => handleResizeStart(e, 'callType')}
                />
              </div>
              <div style={{ width: columnWidths.address }} className="px-2 flex-shrink-0 relative">
                ADDRESS
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-neutral-400 dark:bg-neutral-700"
                  onMouseDown={(e) => handleResizeStart(e, 'address')}
                />
              </div>
              <div style={{ width: columnWidths.units }} className="px-2 flex-shrink-0 relative">
                UNITS
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-neutral-400 dark:bg-neutral-700"
                  onMouseDown={(e) => handleResizeStart(e, 'units')}
                />
              </div>
              <div style={{ width: columnWidths.channels }} className="px-2 flex-shrink-0 relative">
                CHANNEL
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 bg-neutral-400 dark:bg-neutral-700"
                  onMouseDown={(e) => handleResizeStart(e, 'channels')}
                />
              </div>
            </div>
          </div>

          <div className="relative min-w-[800px]">{visibleItems}</div>
        </div>
      </div>
    );
  }
);

VirtualizedList.displayName = "VirtualizedList";

const SkeletonLoader = ({ columnWidths }: { columnWidths: { play: number; time: number; callType: number; address: number; units: number; channels: number } }) => {
  return (
    <div className="flex flex-col">
      <div className="bg-neutral-200 dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs font-bold px-2 py-2 border-b-2 border-neutral-300 dark:border-neutral-600 sticky top-0 z-10 min-w-[800px]">
        <div className="flex items-center">
          <div style={{ width: columnWidths.play }} className="text-center flex-shrink-0 flex items-center justify-center">
            <Volume2 className="w-3 h-3" />
          </div>
          <div style={{ width: columnWidths.time }} className="text-center flex-shrink-0">
            TIME
          </div>
          <div style={{ width: columnWidths.callType }} className="px-2 flex-shrink-0">
            CALL TYPE
          </div>
          <div style={{ width: columnWidths.address }} className="px-2 flex-shrink-0">
            ADDRESS
          </div>
          <div style={{ width: columnWidths.units }} className="px-2 flex-shrink-0">
            UNITS
          </div>
          <div style={{ width: columnWidths.channels }} className="px-2 flex-shrink-0">
            CHANNEL
          </div>
        </div>
      </div>
      <div className="space-y-0">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className={`border-b border-neutral-300 dark:border-neutral-600 min-w-[800px] ${
              i % 2 === 0
                ? "bg-neutral-50 dark:bg-neutral-900"
                : "bg-white dark:bg-neutral-800"
            }`}
            style={{ height: ITEM_HEIGHT }}
          >
            <div className="flex items-center h-full px-2">
              <div style={{ width: columnWidths.play }} className="flex items-center justify-center flex-shrink-0">
                <Skeleton className="w-3 h-3 rounded-full" />
              </div>
              <div style={{ width: columnWidths.time }} className="text-center flex-shrink-0 px-2">
                <Skeleton className="h-3 w-full" />
              </div>
              <div style={{ width: columnWidths.callType }} className="px-2 flex-shrink-0">
                <Skeleton className="h-3 w-full" />
              </div>
              <div style={{ width: columnWidths.address }} className="px-2 flex-shrink-0">
                <Skeleton className="h-3 w-full" />
              </div>
              <div style={{ width: columnWidths.units }} className="px-2 flex-shrink-0">
                <Skeleton className="h-3 w-full" />
              </div>
              <div style={{ width: columnWidths.channels }} className="px-2 flex-shrink-0">
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function IncidentsList({
  incidents,
  selectedIncident,
  onIncidentSelect,
  onDisplayedIncidentsChange,
  onNewIncident,
  onAudioStateChange,
  loading,
  isInitialFetchComplete,
  lastUpdated,
  onRefresh,
  onResetStorage,
}: IncidentsListProps) {
  const { settings } = useSettings();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "ACTIVE",
    dateRange: "DYNAMIC",
    startDate: undefined,
    endDate: undefined,
    startTime: undefined,
    endTime: undefined,
    daysOfWeek: [],
    agency: "ALL",
    units: [],
    showOnlyStaging: false,
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isFiltersDialogOpen, setIsFiltersDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [unitSearch, setUnitSearch] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);


  const getDateRange = useCallback((range: DateRange) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
      case "ALL":
        return { start: undefined, end: undefined };
      case "DYNAMIC":
        return { start: undefined, end: undefined };
      case "LAST_30_MINS":
        return {
          start: new Date(now.getTime() - 30 * 60 * 1000),
          end: now,
        };
      case "LAST_HOUR":
        return {
          start: new Date(now.getTime() - 60 * 60 * 1000),
          end: now,
        };
      case "LAST_4_HOURS":
        return {
          start: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          end: now,
        };
      case "LAST_12_HOURS":
        return {
          start: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          end: now,
        };
      case "TODAY":
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        };
      case "WEEK":
        return {
          start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: new Date(),
        };
      case "CUSTOM":
        let start = filters.startDate;
        let end = filters.endDate;

        if (start && filters.startTime) {
          const [hours, minutes] = filters.startTime.split(':').map(Number);
          start = new Date(start);
          start.setHours(hours, minutes, 0, 0);
        }

        if (end && filters.endTime) {
          const [hours, minutes] = filters.endTime.split(':').map(Number);
          end = new Date(end);
          end.setHours(hours, minutes, 59, 999);
        }

        return { start, end };
      default:
        return { start: undefined, end: undefined };
    }
  }, [filters.startDate, filters.endDate, filters.startTime, filters.endTime]);

  const allFilteredIncidents = useMemo(() => {
    const filtered = incidents.filter((incident) => {
      if (settings.hideIncompleteIncidents) {
        const hasNoCallType = !incident.issue_reported ||
          incident.issue_reported === '?' ||
          incident.issue_reported === 'Nondeterminate' ||
          incident.issue_reported.trim() === '';

        const hasNoAddress = !incident.location ||
          !incident.location.coordinates ||
          incident.location.coordinates[0] === 0 ||
          incident.location.coordinates[1] === 0;

        const hasNoUnits = !incident.units || incident.units.length === 0;

        const hasNoChannels = !incident.channels || incident.channels.length === 0;

        if (hasNoCallType && hasNoAddress && hasNoUnits && hasNoChannels) {
          return false;
        }
      }

      if (settings.hideIncidentsWithoutUnitsOrCallType) {
        const hasNoCallType = !incident.issue_reported ||
          incident.issue_reported === '?' ||
          incident.issue_reported === 'Nondeterminate' ||
          incident.issue_reported.trim() === '';

        const hasNoUnits = !incident.units || incident.units.length === 0;

        if (hasNoCallType && hasNoUnits) {
          return false;
        }
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchFields = [
          incident.issue_reported,
          incident.address,
          incident.agency,
          incident.traffic_report_status,
        ];

        if (
          !searchFields.some((field) =>
            field?.toLowerCase().includes(searchLower)
          )
        ) {
          return false;
        }
      }

      if (
        filters.status !== "ALL" &&
        incident.traffic_report_status !== filters.status
      ) {
        return false;
      }

      if (filters.agency !== "ALL" && incident.agency !== filters.agency) {
        return false;
      }

      if (filters.units.length > 0) {
        const hasMatchingUnit = incident.units?.some(unit =>
          filters.units.includes(unit)
        );
        if (!hasMatchingUnit) {
          return false;
        }
      }

      if (filters.showOnlyStaging) {
        const hasStagingInstructions = incident.rawTranscript?.toLowerCase().includes("check for possible staging instructions");
        if (!hasStagingInstructions) {
          return false;
        }
      }

      if (filters.daysOfWeek.length > 0) {
        const incidentDate = new Date(incident.published_date);
        const dayOfWeek = incidentDate.getDay();
        if (!filters.daysOfWeek.includes(dayOfWeek)) {
          return false;
        }
      }

      if (filters.dateRange === "ALL") {
        return true;
      } else if (filters.dateRange === "DYNAMIC") {
        if (incident.estimatedResolutionMinutes) {
          const incidentDate = new Date(incident.published_date);
          const now = new Date();
          const minutesSinceIncident = (now.getTime() - incidentDate.getTime()) / (1000 * 60);

          if (minutesSinceIncident > incident.estimatedResolutionMinutes) {
            return false;
          }
        }
      } else {
        const dateRange = getDateRange(filters.dateRange);
        if (dateRange.start || dateRange.end) {
          const incidentDate = new Date(incident.published_date);

          if (dateRange.start) {
            if (incidentDate < dateRange.start) {
              return false;
            }
          }

          if (dateRange.end) {
            if (incidentDate > dateRange.end) {
              return false;
            }
          }
        }
      }

      return true;
    });

    return filtered;
  }, [incidents, filters, getDateRange, settings.hideIncompleteIncidents, settings.hideIncidentsWithoutUnitsOrCallType]);

  const displayedIncidents = useMemo(() => {
    const sorted = allFilteredIncidents.sort(
      (a, b) =>
        new Date(b.published_date).getTime() -
        new Date(a.published_date).getTime()
    );

    if (filters.dateRange === "DYNAMIC") {
      return removeUnitsFromOlderIncidents(sorted);
    }

    return sorted;
  }, [allFilteredIncidents, filters.dateRange]);


  useEffect(() => {
    if (onDisplayedIncidentsChange) {
      onDisplayedIncidentsChange(displayedIncidents);
    }
  }, [displayedIncidents, onDisplayedIncidentsChange]);

  const uniqueAgencies = useMemo(() => {
    const agencies = new Set(
      incidents.map((incident) => incident.agency?.trim() || "Unknown")
    );
    return Array.from(agencies).sort();
  }, [incidents]);

  const uniqueUnits = useMemo(() => {
    const units = new Set<string>();
    incidents.forEach((incident) => {
      incident.units?.forEach((unit) => units.add(unit.trim()));
    });
    return Array.from(units).sort();
  }, [incidents]);

  const filteredUnits = useMemo(() => {
    if (!unitSearch.trim()) return uniqueUnits;
    const searchLower = unitSearch.toLowerCase();
    return uniqueUnits.filter(unit => unit.toLowerCase().includes(searchLower));
  }, [uniqueUnits, unitSearch]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.status !== "ACTIVE") count++;
    if (filters.agency !== "ALL") count++;
    if (filters.units.length > 0) count++;
    if (filters.showOnlyStaging) count++;
    if (filters.dateRange !== "DYNAMIC" && filters.dateRange !== "ALL") count++;
    if (filters.daysOfWeek.length > 0) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      search: "",
      status: "ACTIVE",
      dateRange: "DYNAMIC",
      startDate: undefined,
      endDate: undefined,
      startTime: undefined,
      endTime: undefined,
      daysOfWeek: [],
      agency: "ALL",
      units: [],
      showOnlyStaging: false,
    });
  };

  const handlePlayAudio = useCallback(
    async (e: React.MouseEvent, incident: FireIncident) => {
      e.stopPropagation();

      if (!incident.audioUrl) return;

      if (playingAudioId === incident.traffic_report_id) {
        if (playPromiseRef.current) {
          await playPromiseRef.current.catch(() => {});
        }
        audioRef.current?.pause();
        playPromiseRef.current = null;
        setPlayingAudioId(null);
        onAudioStateChange?.(false);
      } else {
        if (audioRef.current) {
          if (playPromiseRef.current) {
            await playPromiseRef.current.catch(() => {});
          }
          audioRef.current.pause();
        }

        audioRef.current = new Audio(incident.audioUrl);
        playPromiseRef.current = audioRef.current.play().catch((error) => {
          console.error("Playback failed:", error);
        });
        setPlayingAudioId(incident.traffic_report_id);
        onAudioStateChange?.(true);

        audioRef.current.onended = () => {
          playPromiseRef.current = null;
          setPlayingAudioId(null);
          onAudioStateChange?.(false);
        };
      }
    },
    [playingAudioId, onAudioStateChange]
  );

  const handleDownloadAudio = useCallback((e: React.MouseEvent, incident: FireIncident) => {
    e.stopPropagation();
    if (!incident.audioUrl) return;

    const timestamp = format(new Date(incident.published_date), "yyyy-MM-dd_HHmm");
    const callType = incident.issue_reported?.replace(/[^a-zA-Z0-9]/g, '_') || 'dispatch';
    const filename = `${timestamp}_${callType}.mp3`;

    const link = document.createElement('a');
    link.href = incident.audioUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getTimeSinceUpdate = () => {
    if (!lastUpdated) return "";
    const diffMs = currentTime.getTime() - lastUpdated.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);

    if (diffSeconds < 60) {
      if (diffSeconds <= 1) return "Just now";
      return `${diffSeconds}s ago`;
    }

    if (diffMinutes < 60) {
      if (diffMinutes === 1) return "1m ago";
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return "1h ago";
    return `${diffHours}h ago`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 md:p-4 border-b space-y-3 md:space-y-4">
        <div className="flex items-start md:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-lg font-semibold">Incidents</h2>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {getTimeSinceUpdate()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-1 md:gap-2 min-w-11 md:min-w-0"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden md:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onResetStorage}
              disabled={loading}
              className="gap-1 md:gap-2 min-w-11 md:min-w-0"
              title="Clear cache and reload data"
            >
              <Trash2 className="h-3 w-3" />
              <span className="hidden md:inline">Reset</span>
            </Button>
            <ExportPopover incidents={displayedIncidents} disabled={loading} />
            <span className="bg-neutral-200 dark:bg-neutral-700 px-2 py-1 rounded text-xs font-medium hidden md:inline">
              {displayedIncidents.length} incidents
            </span>
          </div>
        </div>
        <span className="bg-neutral-200 dark:bg-neutral-700 px-2 py-1 rounded text-xs font-medium md:hidden inline-block">
          {displayedIncidents.length} incidents
        </span>

        {/* Search and Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search incidents..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="pl-10 h-11"
            />
          </div>

          <Dialog open={isFiltersDialogOpen} onOpenChange={setIsFiltersDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 min-h-11 relative">
                <Filter className="h-4 w-4" />
                <span className="hidden md:inline">Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Filter Incidents</DialogTitle>
                <DialogDescription>
                  Customize which incidents are displayed
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={filters.status}
                    onValueChange={(value: IncidentStatus) =>
                      setFilters((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Agency</label>
                  <Select
                    value={filters.agency}
                    onValueChange={(value) =>
                      setFilters((prev) => ({ ...prev, agency: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Agency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Agencies</SelectItem>
                      {uniqueAgencies.map((agency, index) => (
                        <SelectItem key={`${agency}-${index}`} value={agency}>
                          {agency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Units</label>
                  <Input
                    placeholder="Search units..."
                    value={unitSearch}
                    onChange={(e) => setUnitSearch(e.target.value)}
                    className="h-9"
                  />
                  <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
                    {filteredUnits.length > 0 ? (
                      filteredUnits.map((unit) => (
                        <div
                          key={unit}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                            filters.units.includes(unit) ? "bg-blue-50 dark:bg-blue-950" : ""
                          }`}
                          onClick={() => {
                            setFilters((prev) => ({
                              ...prev,
                              units: prev.units.includes(unit)
                                ? prev.units.filter((u) => u !== unit)
                                : [...prev.units, unit],
                            }));
                          }}
                        >
                          <div className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                            filters.units.includes(unit)
                              ? "bg-blue-600 border-blue-600"
                              : "border-neutral-300 dark:border-neutral-600"
                          }`}>
                            {filters.units.includes(unit) && (
                              <div className="w-2 h-2 bg-white rounded-sm" />
                            )}
                          </div>
                          <span className="text-sm">{unit}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        No units available
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 border rounded cursor-pointer flex items-center justify-center ${
                        filters.showOnlyStaging
                          ? "bg-blue-600 border-blue-600"
                          : "border-neutral-300 dark:border-neutral-600"
                      }`}
                      onClick={() => setFilters((prev) => ({ ...prev, showOnlyStaging: !prev.showOnlyStaging }))}
                    >
                      {filters.showOnlyStaging && (
                        <div className="w-2.5 h-2.5 bg-white rounded-sm" />
                      )}
                    </div>
                    <label className="text-sm font-medium cursor-pointer" onClick={() => setFilters((prev) => ({ ...prev, showOnlyStaging: !prev.showOnlyStaging }))}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Show only staging instructions
                      </div>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select
                    value={filters.dateRange}
                    onValueChange={(value: DateRange) =>
                      setFilters((prev) => ({ ...prev, dateRange: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="DYNAMIC">Dynamic</SelectItem>
                      <SelectItem value="LAST_30_MINS">Last 30 Mins</SelectItem>
                      <SelectItem value="LAST_HOUR">Last Hour</SelectItem>
                      <SelectItem value="LAST_4_HOURS">Last 4 Hours</SelectItem>
                      <SelectItem value="LAST_12_HOURS">Last 12 Hours</SelectItem>
                      <SelectItem value="TODAY">Today</SelectItem>
                      <SelectItem value="WEEK">Week</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filters.dateRange === "CUSTOM" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Custom Date Range</label>
                      <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start gap-2">
                            <Calendar className="h-4 w-4" />
                            {filters.startDate && filters.endDate
                              ? `${format(filters.startDate, "MMM dd")} - ${format(filters.endDate, "MMM dd")}`
                              : "Select date range"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="range"
                            selected={{
                              from: filters.startDate,
                              to: filters.endDate,
                            }}
                            onSelect={(range) => {
                              setFilters((prev) => ({
                                ...prev,
                                startDate: range?.from,
                                endDate: range?.to,
                              }));
                              if (range?.from && range?.to) {
                                setIsDatePickerOpen(false);
                              }
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Time (Optional)</label>
                      <Input
                        type="time"
                        value={filters.startTime || ""}
                        onChange={(e) => setFilters((prev) => ({ ...prev, startTime: e.target.value }))}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Time (Optional)</label>
                      <Input
                        type="time"
                        value={filters.endTime || ""}
                        onChange={(e) => setFilters((prev) => ({ ...prev, endTime: e.target.value }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Days of Week</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Sunday', value: 0 },
                      { label: 'Monday', value: 1 },
                      { label: 'Tuesday', value: 2 },
                      { label: 'Wednesday', value: 3 },
                      { label: 'Thursday', value: 4 },
                      { label: 'Friday', value: 5 },
                      { label: 'Saturday', value: 6 },
                    ].map((day) => (
                      <div
                        key={day.value}
                        className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          filters.daysOfWeek.includes(day.value) ? "bg-blue-50 dark:bg-blue-950" : ""
                        }`}
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            daysOfWeek: prev.daysOfWeek.includes(day.value)
                              ? prev.daysOfWeek.filter((d) => d !== day.value)
                              : [...prev.daysOfWeek, day.value],
                          }));
                        }}
                      >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                          filters.daysOfWeek.includes(day.value)
                            ? "bg-blue-600 border-blue-600"
                            : "border-neutral-300 dark:border-neutral-600"
                        }`}>
                          {filters.daysOfWeek.includes(day.value) && (
                            <div className="w-2 h-2 bg-white rounded-sm" />
                          )}
                        </div>
                        <span className="text-sm">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <Button variant="outline" onClick={clearFilters} className="w-full">
                    Clear All Filters
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Incidents List */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {loading && incidents.length === 0 ? (
          <div className="overflow-auto">
            {isMobile ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <SkeletonLoader
                columnWidths={{
                  play: 32,
                  time: 80,
                  callType: 168,
                  address: 192,
                  units: 128,
                  channels: 110,
                }}
              />
            )}
          </div>
        ) : allFilteredIncidents.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-center text-neutral-500 py-8">
              No incidents found matching your filters.
            </div>
          </div>
        ) : isMobile ? (
          <div className="overflow-auto p-4 space-y-3">
            {displayedIncidents.map((incident) => (
              <IncidentCard
                key={incident.traffic_report_id}
                incident={incident}
                isSelected={
                  selectedIncident?.traffic_report_id ===
                  incident.traffic_report_id
                }
                isNew={false}
                isPlaying={playingAudioId === incident.traffic_report_id}
                showDownloadButton={settings.showDownloadButton}
                onSelect={onIncidentSelect}
                onPlayAudio={handlePlayAudio}
                onDownloadAudio={handleDownloadAudio}
              />
            ))}
          </div>
        ) : (
          <VirtualizedList
            incidents={displayedIncidents}
            allIncidents={incidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={onIncidentSelect}
            autoPlayAudio={settings.autoPlayAudio}
            showDownloadButton={settings.showDownloadButton}
            onNewIncident={onNewIncident}
            onAudioStateChange={onAudioStateChange}
            loading={loading}
            isInitialFetchComplete={isInitialFetchComplete}
          />
        )}
      </div>
    </div>
  );
}
