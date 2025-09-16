"use client";

import { useState, useMemo, memo, useRef, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Search, Calendar, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

interface IncidentsListProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
  onDisplayedIncidentsChange?: (incidents: FireIncident[]) => void;
  loading?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
}

const ITEM_HEIGHT = 32;
const BUFFER_SIZE = 10;

const VirtualizedList = memo(
  ({
    incidents,
    selectedIncident,
    onIncidentSelect,
    hasMoreItems,
    loadMore,
    allFilteredCount,
  }: {
    incidents: FireIncident[];
    selectedIncident: FireIncident | null;
    onIncidentSelect: (incident: FireIncident) => void;
    hasMoreItems: boolean;
    loadMore: () => void;
    allFilteredCount: number;
  }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const formatDate = (dateString: string) => {
      try {
        return format(new Date(dateString), "MM/dd HH:mm");
      } catch {
        return "Invalid date";
      }
    };

    const LOAD_MORE_HEIGHT = hasMoreItems ? 48 : 0;

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

      visibleItems.push(
        <div
          key={incident.traffic_report_id}
          className={`absolute left-0 right-0 cursor-pointer transition-colors border-b border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700 min-w-[800px] ${
            isSelected
              ? "bg-blue-200 dark:bg-blue-800"
              : i % 2 === 0
              ? "bg-neutral-50 dark:bg-neutral-900"
              : "bg-white dark:bg-neutral-800"
          }`}
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
          <div className="flex items-center h-full px-2 text-xs">
            <div className="w-20 text-center text-neutral-500 dark:text-neutral-400 font-mono">
              {formatDate(incident.published_date)}
            </div>
            <div className="w-42 px-2 truncate font-medium">
              {incident.issue_reported}
            </div>
            <div className="w-48 px-2 truncate text-neutral-600 dark:text-neutral-400">
              {incident.address}
            </div>
            <div className="w-24 px-2 truncate text-neutral-600 dark:text-neutral-400 text-center">
              {incident.agency?.trim() || "Unknown"}
            </div>
            <div className="w-16 text-center">
              <span
                className={`inline-block px-2 py-1 text-xs font-bold rounded ${
                  incident.traffic_report_status === "ACTIVE"
                    ? (incident.incidentType || "fire") === "fire"
                      ? "bg-red-600 text-white"
                      : "bg-yellow-500 text-white"
                    : "bg-neutral-500 text-white"
                }`}
              >
                {incident.traffic_report_status === "ACTIVE"
                  ? "ACTIVE"
                  : "CLOSED"}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Add Load More button if it should be visible
    if (
      hasMoreItems &&
      scrollTop + containerHeight >= incidents.length * ITEM_HEIGHT - 100
    ) {
      visibleItems.push(
        <div
          key="load-more"
          className="absolute inset-x-0 flex items-center justify-center bg-white dark:bg-neutral-900 border-t border-neutral-300 dark:border-neutral-600 min-w-[800px]"
          style={
            {
              "--item-top": `${incidents.length * ITEM_HEIGHT}px`,
              "--item-height": `${LOAD_MORE_HEIGHT}px`,
              top: "var(--item-top)",
              height: "var(--item-height)",
            } as React.CSSProperties
          }
        >
          <button
            onClick={loadMore}
            className="px-4 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded border border-neutral-300 dark:border-neutral-600 transition-colors"
          >
            Load More ({Math.min(50, allFilteredCount - incidents.length)} more
            incidents)
          </button>
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
          <div className="bg-neutral-900 dark:bg-black text-white text-xs font-bold px-2 py-2 border-b-2 border-neutral-600 sticky top-0 z-10 min-w-[800px]">
            <div className="flex items-center">
              <div className="w-20 text-center">TIME</div>
              <div className="w-42 px-2">CALL TITLE</div>
              <div className="w-48 px-2">ADDRESS</div>
              <div className="w-24 px-2 text-center">AGENCY</div>
              <div className="w-16 text-center">STATUS</div>
            </div>
          </div>

          <div className="relative min-w-[800px]">{visibleItems}</div>
        </div>
      </div>
    );
  }
);

VirtualizedList.displayName = "VirtualizedList";

export function IncidentsList({
  incidents,
  selectedIncident,
  onIncidentSelect,
  onDisplayedIncidentsChange,
  loading,
  lastUpdated,
  onRefresh,
}: IncidentsListProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "ALL",
    dateRange: "WEEK",
    startDate: undefined,
    endDate: undefined,
    agency: "ALL",
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);
  const [currentTime, setCurrentTime] = useState(new Date());

  const ITEMS_PER_PAGE = 100;

  const getDateRange = useCallback((range: DateRange) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
      case "TODAY":
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        };
      case "LAST_3_DAYS":
        return {
          start: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
          end: new Date(),
        };
      case "WEEK":
        return {
          start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: new Date(),
        };
      case "MONTH":
        return {
          start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
        };
      case "CUSTOM":
        return { start: filters.startDate, end: filters.endDate };
      default:
        return {
          start: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
          end: new Date(),
        };
    }
  }, [filters.startDate, filters.endDate]);

  const allFilteredIncidents = useMemo(() => {
    const filtered = incidents.filter((incident) => {
      // Search filter
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

      // Status filter
      if (
        filters.status !== "ALL" &&
        incident.traffic_report_status !== filters.status
      ) {
        return false;
      }

      // Agency filter
      if (filters.agency !== "ALL" && incident.agency !== filters.agency) {
        return false;
      }

      // Date range filter
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

      return true;
    });

    return filtered;
  }, [incidents, filters, getDateRange]);

  // Get the currently displayed incidents with balanced mix
  const displayedIncidents = useMemo(() => {
    // Create a balanced mix of fire and traffic incidents
    const fireIncidents = allFilteredIncidents.filter(
      (i) => i.incidentType === "fire"
    );
    const trafficIncidents = allFilteredIncidents.filter(
      (i) => i.incidentType === "traffic"
    );

    const halfCount = Math.floor(displayCount / 2);
    const fireSlice = fireIncidents.slice(0, halfCount);
    const trafficSlice = trafficIncidents.slice(0, halfCount);

    // Combine and sort by date (newest first)
    const mixed = [...fireSlice, ...trafficSlice].sort(
      (a, b) =>
        new Date(b.published_date).getTime() -
        new Date(a.published_date).getTime()
    );

    // If we don't have enough of one type, fill with the other type
    if (mixed.length < displayCount) {
      const remaining = displayCount - mixed.length;
      const allRemaining = allFilteredIncidents.filter(
        (i) => !mixed.some((m) => m.traffic_report_id === i.traffic_report_id)
      );
      mixed.push(...allRemaining.slice(0, remaining));
    }

    return mixed.slice(0, displayCount);
  }, [allFilteredIncidents, displayCount]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE);
  }, [filters, ITEMS_PER_PAGE]);

  // Notify parent of displayed incidents changes
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

  const clearFilters = () => {
    setFilters({
      search: "",
      status: "ALL",
      dateRange: "WEEK",
      startDate: undefined,
      endDate: undefined,
      agency: "ALL",
    });
  };

  const loadMore = () => {
    setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
  };

  const hasMoreItems = displayCount < allFilteredIncidents.length;

  // Update current time every second for real-time "time ago" display
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
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Incidents</h2>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {getTimeSinceUpdate()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <span className="bg-neutral-200 dark:bg-neutral-700 px-2 py-1 rounded text-xs font-medium">
              {displayedIncidents.length} of {allFilteredIncidents.length}{" "}
              incidents
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search incidents..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select
            value={filters.status}
            onValueChange={(value: IncidentStatus) =>
              setFilters((prev) => ({ ...prev, status: value }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.agency}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, agency: value }))
            }
          >
            <SelectTrigger className="w-32">
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

          <Select
            value={filters.dateRange}
            onValueChange={(value: DateRange) =>
              setFilters((prev) => ({ ...prev, dateRange: value }))
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAY">Today</SelectItem>
              <SelectItem value="LAST_3_DAYS">Last 3 Days</SelectItem>
              <SelectItem value="WEEK">Week</SelectItem>
              <SelectItem value="MONTH">Month</SelectItem>
              <SelectItem value="CUSTOM">Custom</SelectItem>
            </SelectContent>
          </Select>

          {filters.dateRange === "CUSTOM" && (
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {filters.startDate
                    ? format(filters.startDate, "MMM dd")
                    : "Custom Date"}
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
          )}

          {(filters.search ||
            filters.status !== "ALL" ||
            filters.agency !== "ALL" ||
            filters.dateRange !== "WEEK" ||
            filters.startDate ||
            filters.endDate) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Incidents List */}
      <div className="flex flex-col flex-1">
        {allFilteredIncidents.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <div className="text-center text-neutral-500 py-8">
              No incidents found matching your filters.
            </div>
          </div>
        ) : (
          <VirtualizedList
            incidents={displayedIncidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={onIncidentSelect}
            hasMoreItems={hasMoreItems}
            loadMore={loadMore}
            allFilteredCount={allFilteredIncidents.length}
          />
        )}
      </div>
    </div>
  );
}
