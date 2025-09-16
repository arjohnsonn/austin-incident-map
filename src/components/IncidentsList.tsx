'use client';

import { useState, useMemo, memo, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Search, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FireIncident, FilterState, IncidentStatus } from '@/types/incident';

interface IncidentsListProps {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
  onDisplayedIncidentsChange?: (incidents: FireIncident[]) => void;
}

const ITEM_HEIGHT = 140;
const BUFFER_SIZE = 5;

const VirtualizedList = memo(({
  incidents,
  selectedIncident,
  onIncidentSelect
}: {
  incidents: FireIncident[];
  selectedIncident: FireIncident | null;
  onIncidentSelect: (incident: FireIncident) => void;
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
      return format(new Date(dateString), 'MMM dd, HH:mm');
    } catch {
      return 'Invalid date';
    }
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
  const endIndex = Math.min(
    incidents.length - 1,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
  );

  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const incident = incidents[i];
    const isSelected = selectedIncident?.traffic_report_id === incident.traffic_report_id;

    visibleItems.push(
      <div
        key={incident.traffic_report_id}
        style={{
          position: 'absolute',
          top: i * ITEM_HEIGHT,
          left: 0,
          right: 0,
          height: ITEM_HEIGHT,
        }}
        className="px-4 py-1.5"
      >
        <Card
          className={`cursor-pointer transition-all hover:shadow-md h-full ${
            isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
          }`}
          onClick={() => onIncidentSelect(incident)}
        >
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-sm leading-tight">
                  {incident.issue_reported}
                </h3>
                <Badge
                  variant={incident.traffic_report_status === 'ACTIVE' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {incident.traffic_report_status}
                </Badge>
              </div>

              <div className="text-sm text-gray-600">
                {incident.address}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{incident.agency}</span>
                <span>{formatDate(incident.published_date)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <div
        className="overflow-auto h-full"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: incidents.length * ITEM_HEIGHT,
            position: 'relative',
          }}
        >
          {visibleItems}
        </div>
      </div>
    </div>
  );
});

VirtualizedList.displayName = 'VirtualizedList';

export function IncidentsList({ incidents, selectedIncident, onIncidentSelect, onDisplayedIncidentsChange }: IncidentsListProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'ALL',
    startDate: undefined,
    endDate: undefined,
    agency: 'ALL',
  });

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(50);

  const ITEMS_PER_PAGE = 50;

  const allFilteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchFields = [
          incident.issue_reported,
          incident.address,
          incident.agency,
          incident.traffic_report_status,
        ];

        if (!searchFields.some(field => field.toLowerCase().includes(searchLower))) {
          return false;
        }
      }

      // Status filter
      if (filters.status !== 'ALL' && incident.traffic_report_status !== filters.status) {
        return false;
      }

      // Agency filter
      if (filters.agency !== 'ALL' && incident.agency !== filters.agency) {
        return false;
      }

      // Date filter
      if (filters.startDate || filters.endDate) {
        const incidentDate = new Date(incident.published_date);

        if (filters.startDate && incidentDate < filters.startDate) {
          return false;
        }

        if (filters.endDate && incidentDate > filters.endDate) {
          return false;
        }
      }

      return true;
    });
  }, [incidents, filters]);

  // Get the currently displayed incidents (first displayCount items)
  const displayedIncidents = useMemo(() => {
    return allFilteredIncidents.slice(0, displayCount);
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
    const agencies = new Set(incidents.map(incident => incident.agency));
    return Array.from(agencies).sort();
  }, [incidents]);

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'ALL',
      startDate: undefined,
      endDate: undefined,
      agency: 'ALL',
    });
  };

  const loadMore = () => {
    setDisplayCount(prev => prev + ITEMS_PER_PAGE);
  };

  const hasMoreItems = displayCount < allFilteredIncidents.length;


  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fire Incidents</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {displayedIncidents.length} of {allFilteredIncidents.length} incidents
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search incidents..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={filters.status} onValueChange={(value: IncidentStatus) => setFilters(prev => ({ ...prev, status: value }))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.agency} onValueChange={(value) => setFilters(prev => ({ ...prev, agency: value }))}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Agency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Agencies</SelectItem>
              {uniqueAgencies.map(agency => (
                <SelectItem key={agency} value={agency}>{agency}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                {filters.startDate ? format(filters.startDate, 'MMM dd') : 'Date'}
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
                  setFilters(prev => ({
                    ...prev,
                    startDate: range?.from,
                    endDate: range?.to,
                  }));
                  if (range?.from && range?.to) {
                    setIsDatePickerOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {(filters.search || filters.status !== 'ALL' || filters.agency !== 'ALL' || filters.startDate || filters.endDate) && (
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
            <div className="text-center text-gray-500 py-8">
              No incidents found matching your filters.
            </div>
          </div>
        ) : (
          <>
            <VirtualizedList
              incidents={displayedIncidents}
              selectedIncident={selectedIncident}
              onIncidentSelect={onIncidentSelect}
            />

            {/* Load More Button */}
            {hasMoreItems && (
              <div className="p-4 border-t">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  className="w-full"
                >
                  Load More ({Math.min(ITEMS_PER_PAGE, allFilteredIncidents.length - displayCount)} more incidents)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}