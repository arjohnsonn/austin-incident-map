'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FireIncident } from '@/types/incident';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { format } from 'date-fns';
import { ArrowLeft, Search, ChevronRight } from 'lucide-react';

interface StatisticsDashboardProps {
  incidents: FireIncident[];
}

interface BarChartProps {
  data: number[];
  labels: string[];
  colors?: string[];
  height?: number;
}

interface HorizontalBarChartProps {
  data: { label: string; count: number }[];
  color?: string;
  onSelect?: (label: string) => void;
}

function BarChart({ data, labels, colors, height = 160 }: BarChartProps) {
  const max = Math.max(...data, 1);
  const barHeight = height - 40;

  return (
    <div className="flex gap-1" style={{ height }}>
      {data.map((value, i) => {
        const barPx = (value / max) * barHeight;
        return (
          <div key={i} className="flex-1 flex flex-col items-center min-w-0">
            <span className="text-xs text-muted-foreground h-5 flex items-center justify-center">
              {value || ''}
            </span>
            <div
              className="flex-1 w-full flex items-end justify-center"
              style={{ height: barHeight }}
            >
              <div
                className={`w-full max-w-16 rounded-t ${colors?.[i] ?? 'bg-blue-600'}`}
                style={{
                  height: Math.max(barPx, value > 0 ? 4 : 0),
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground truncate w-full text-center h-5 flex items-center justify-center">
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBarChart({ data, color = 'bg-blue-600', onSelect }: HorizontalBarChartProps) {
  const max = Math.max(...data.map((d) => d.count), 1);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No data available</p>;
  }

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <button
          key={item.label}
          onClick={() => onSelect?.(item.label)}
          className="w-full flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-0.5 transition-colors text-left"
        >
          <span className="w-28 text-xs truncate text-right" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
            <div
              className={`h-full rounded ${color}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-xs tabular-nums text-right">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm flex-1">{label}</span>
      <Progress value={percent} className="w-24 h-2" />
      <span className="text-sm tabular-nums w-12 text-right">{percent.toFixed(0)}%</span>
    </div>
  );
}

function IncidentRow({
  incident,
  onClick,
}: {
  incident: FireIncident;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{incident.issue_reported}</p>
          <p className="text-xs text-muted-foreground truncate">
            {incident.address || 'Unknown address'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(incident.published_date), 'MM/dd HH:mm')}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {incident.units && incident.units.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {incident.units.slice(0, 4).map((u, i) => (
            <Badge key={`${u}-${i}`} variant="secondary" className="text-xs">
              {u}
            </Badge>
          ))}
          {incident.units.length > 4 && (
            <Badge variant="secondary" className="text-xs">
              +{incident.units.length - 4}
            </Badge>
          )}
        </div>
      )}
    </button>
  );
}

function UnitInsightsView({
  unit,
  incidents,
  onBack,
  onSelectCallType,
  onSelectUnit,
  onSelectIncident,
  isMobile,
}: {
  unit: string;
  incidents: FireIncident[];
  onBack: () => void;
  onSelectCallType: (callType: string) => void;
  onSelectUnit: (unit: string) => void;
  onSelectIncident: (incident: FireIncident) => void;
  isMobile: boolean;
}) {
  const stats = useMemo(() => {
    const unitIncidents = incidents.filter((inc) => inc.units?.includes(unit));
    const byHour = Array(24).fill(0) as number[];
    const byDay = Array(7).fill(0) as number[];
    const callTypeCounts = new Map<string, number>();
    const coRespondingUnits = new Map<string, number>();

    unitIncidents.forEach((inc) => {
      const date = new Date(inc.published_date);
      if (!isNaN(date.getTime())) {
        byHour[date.getHours()]++;
        byDay[date.getDay()]++;
      }

      if (inc.issue_reported) {
        callTypeCounts.set(inc.issue_reported, (callTypeCounts.get(inc.issue_reported) || 0) + 1);
      }

      inc.units?.forEach((u) => {
        if (u !== unit) {
          coRespondingUnits.set(u, (coRespondingUnits.get(u) || 0) + 1);
        }
      });
    });

    const topCallTypes = [...callTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));

    const topCoResponders = [...coRespondingUnits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));

    const recentIncidents = unitIncidents
      .sort((a, b) => new Date(b.published_date).getTime() - new Date(a.published_date).getTime())
      .slice(0, 20);

    const peakHourIndex = byHour.indexOf(Math.max(...byHour));
    const peakHour = new Date(0, 0, 0, peakHourIndex).toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: true,
    });

    const peakDayIndex = byDay.indexOf(Math.max(...byDay));
    const peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peakDayIndex];

    return {
      total: unitIncidents.length,
      byHour,
      byDay,
      topCallTypes,
      topCoResponders,
      recentIncidents,
      peakHour,
      peakDay,
    };
  }, [incidents, unit]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (isMobile) return i % 6 === 0 ? String(i) : '';
    return i % 2 === 0 ? String(i) : '';
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-bold">{unit}</h2>
          <p className="text-sm text-muted-foreground">{stats.total} incidents</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Responses" value={stats.total} />
        <SummaryCard label="Peak Hour" value={stats.peakHour} />
        <SummaryCard label="Busiest Day" value={stats.peakDay || '-'} />
        <SummaryCard label="Co-responders" value={stats.topCoResponders.length} subtext="unique units" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Responses by Time of Day</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[400px]">
              <BarChart data={stats.byHour} labels={hourLabels} height={160} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Responses by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={stats.byDay} labels={dayLabels} height={160} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Call Types Responded To</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={stats.topCallTypes}
              color="bg-purple-600"
              onSelect={onSelectCallType}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Frequent Co-responders</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={stats.topCoResponders}
              color="bg-green-600"
              onSelect={onSelectUnit}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.recentIncidents.map((inc) => (
              <IncidentRow
                key={inc.traffic_report_id}
                incident={inc}
                onClick={() => onSelectIncident(inc)}
              />
            ))}
            {stats.recentIncidents.length === 0 && (
              <p className="text-sm text-muted-foreground">No incidents found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CallTypeInsightsView({
  callType,
  incidents,
  onBack,
  onSelectUnit,
  onSelectIncident,
  isMobile,
}: {
  callType: string;
  incidents: FireIncident[];
  onBack: () => void;
  onSelectUnit: (unit: string) => void;
  onSelectIncident: (incident: FireIncident) => void;
  isMobile: boolean;
}) {
  const stats = useMemo(() => {
    const callTypeIncidents = incidents.filter((inc) => inc.issue_reported === callType);
    const byHour = Array(24).fill(0) as number[];
    const byDay = Array(7).fill(0) as number[];
    const unitCounts = new Map<string, number>();
    let totalUnits = 0;

    callTypeIncidents.forEach((inc) => {
      const date = new Date(inc.published_date);
      if (!isNaN(date.getTime())) {
        byHour[date.getHours()]++;
        byDay[date.getDay()]++;
      }

      inc.units?.forEach((u) => {
        unitCounts.set(u, (unitCounts.get(u) || 0) + 1);
        totalUnits++;
      });
    });

    const topUnits = [...unitCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({ label, count }));

    const recentIncidents = callTypeIncidents
      .sort((a, b) => new Date(b.published_date).getTime() - new Date(a.published_date).getTime())
      .slice(0, 20);

    const peakHourIndex = byHour.indexOf(Math.max(...byHour));
    const peakHour = new Date(0, 0, 0, peakHourIndex).toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: true,
    });

    const peakDayIndex = byDay.indexOf(Math.max(...byDay));
    const peakDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peakDayIndex];

    const avgUnits = callTypeIncidents.length > 0
      ? (totalUnits / callTypeIncidents.length).toFixed(1)
      : '0';

    return {
      total: callTypeIncidents.length,
      byHour,
      byDay,
      topUnits,
      recentIncidents,
      peakHour,
      peakDay,
      avgUnits,
      uniqueUnits: unitCounts.size,
    };
  }, [incidents, callType]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (isMobile) return i % 6 === 0 ? String(i) : '';
    return i % 2 === 0 ? String(i) : '';
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-bold">{callType}</h2>
          <p className="text-sm text-muted-foreground">{stats.total} incidents</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Incidents" value={stats.total} />
        <SummaryCard label="Peak Hour" value={stats.peakHour} />
        <SummaryCard label="Busiest Day" value={stats.peakDay || '-'} />
        <SummaryCard label="Avg Units" value={stats.avgUnits} subtext={`${stats.uniqueUnits} unique`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidents by Time of Day</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[400px]">
              <BarChart data={stats.byHour} labels={hourLabels} height={160} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidents by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={stats.byDay} labels={dayLabels} height={160} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Responding Units</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={stats.topUnits} onSelect={onSelectUnit} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.recentIncidents.map((inc) => (
              <IncidentRow
                key={inc.traffic_report_id}
                incident={inc}
                onClick={() => onSelectIncident(inc)}
              />
            ))}
            {stats.recentIncidents.length === 0 && (
              <p className="text-sm text-muted-foreground">No incidents found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function StatisticsDashboard({ incidents }: StatisticsDashboardProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Detail dialog state
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedCallType, setSelectedCallType] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(null);

  // Lookup dialog state
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupTab, setLookupTab] = useState<string>('units');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = useMemo(() => {
    const byType = { fire: 0, medical: 0, workingFires: 0 };
    const byHour = Array(24).fill(0) as number[];
    const byDay = Array(7).fill(0) as number[];

    const unitCounts = new Map<string, number>();
    const callTypeCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();
    const uniqueUnits = new Set<string>();

    let activeCount = 0;
    let withUnits = 0;
    let withAddress = 0;
    let withAudio = 0;
    let withTranscript = 0;
    let totalUnitsDispatched = 0;
    const uniqueDays = new Set<string>();
    const dailyCounts = new Map<string, number>();

    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;

    incidents.forEach((inc) => {
      const callType = inc.issue_reported?.toLowerCase() || '';
      const isWorkingFire =
        /\b(box\s+alarm|stillbox\s+alarm)\b/i.test(callType) ||
        /\b(1st|first|2nd|second|3rd|third|4th|fourth|5th|fifth)\s+alarm\b/i.test(callType) ||
        /\b(structure\s+fire|building\s+fire|house\s+fire)\b/i.test(callType) ||
        /\b(task\s+force)\b/i.test(callType) ||
        /\b(hazmat|hazardous\s+materials)\b/i.test(callType);

      if (isWorkingFire) {
        byType.workingFires++;
      } else if (inc.incidentType === 'fire') {
        byType.fire++;
      } else if (inc.incidentType === 'medical') {
        byType.medical++;
      }

      const date = new Date(inc.published_date);
      if (!isNaN(date.getTime())) {
        byHour[date.getHours()]++;
        byDay[date.getDay()]++;
        const dateStr = date.toDateString();
        uniqueDays.add(dateStr);
        dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);

        if (!oldestDate || date < oldestDate) oldestDate = date;
        if (!newestDate || date > newestDate) newestDate = date;
      }

      if (inc.traffic_report_status === 'ACTIVE') activeCount++;

      if (inc.units && inc.units.length > 0) {
        withUnits++;
        totalUnitsDispatched += inc.units.length;
        inc.units.forEach((unit) => {
          unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
          uniqueUnits.add(unit);
        });
      }

      inc.channels?.forEach((channel) => {
        channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
      });

      if (inc.issue_reported) {
        callTypeCounts.set(
          inc.issue_reported,
          (callTypeCounts.get(inc.issue_reported) || 0) + 1
        );
      }

      if (inc.address && inc.address !== '?' && inc.location.coordinates[0] !== 0)
        withAddress++;
      if (inc.audioUrl) withAudio++;
      if (inc.rawTranscript) withTranscript++;
    });

    // All units and call types (sorted by count)
    const allUnits = [...unitCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    const allCallTypes = [...callTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));

    const topUnits = allUnits.slice(0, 10);
    const topCallTypes = allCallTypes.slice(0, 10);

    const topChannels = [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    const total = incidents.length;
    const avgPerDay = uniqueDays.size > 0 ? (total / uniqueDays.size).toFixed(1) : '0';
    const avgUnitsPerIncident =
      withUnits > 0 ? (totalUnitsDispatched / withUnits).toFixed(1) : '0';

    const peakHourIndex = byHour.indexOf(Math.max(...byHour));
    const peakHour =
      peakHourIndex >= 0
        ? new Date(0, 0, 0, peakHourIndex).toLocaleTimeString('en-US', {
            hour: 'numeric',
            hour12: true,
          })
        : '-';

    const peakDayIndex = byDay.indexOf(Math.max(...byDay));
    const peakDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][peakDayIndex] || '-';

    let busiestDate = '-';
    let busiestDateCount = 0;
    for (const [dateStr, count] of dailyCounts.entries()) {
      if (count > busiestDateCount) {
        busiestDateCount = count;
        busiestDate = dateStr;
      }
    }

    const dateRange =
      oldestDate && newestDate
        ? `${format(oldestDate, 'MMM d')} - ${format(newestDate, 'MMM d, yyyy')}`
        : '-';

    const pctWithUnits = total > 0 ? (withUnits / total) * 100 : 0;
    const pctWithAddress = total > 0 ? (withAddress / total) * 100 : 0;
    const pctWithAudio = total > 0 ? (withAudio / total) * 100 : 0;
    const pctWithTranscript = total > 0 ? (withTranscript / total) * 100 : 0;

    return {
      byType,
      byHour,
      byDay,
      total,
      activeCount,
      avgPerDay,
      peakHour,
      peakDayName,
      topUnits,
      topCallTypes,
      topChannels,
      allUnits,
      allCallTypes,
      pctWithUnits,
      pctWithAddress,
      pctWithAudio,
      pctWithTranscript,
      uniqueUnitsCount: uniqueUnits.size,
      avgUnitsPerIncident,
      dateRange,
      busiestDate: busiestDate !== '-' ? format(new Date(busiestDate), 'EEE, MMM d') : '-',
      busiestDateCount,
      uniqueDaysCount: uniqueDays.size,
    };
  }, [incidents]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    if (isMobile) return i % 6 === 0 ? String(i) : '';
    return i % 2 === 0 ? String(i) : '';
  });

  // Filter for lookup dialog
  const filteredUnits = useMemo(() => {
    if (!searchQuery) return stats.allUnits;
    const q = searchQuery.toLowerCase();
    return stats.allUnits.filter((u) => u.label.toLowerCase().includes(q));
  }, [stats.allUnits, searchQuery]);

  const filteredCallTypes = useMemo(() => {
    if (!searchQuery) return stats.allCallTypes;
    const q = searchQuery.toLowerCase();
    return stats.allCallTypes.filter((c) => c.label.toLowerCase().includes(q));
  }, [stats.allCallTypes, searchQuery]);

  const handleSelectUnit = (unit: string) => {
    setSelectedUnit(unit);
    setSelectedCallType(null);
    setSelectedIncident(null);
    setLookupOpen(false);
  };

  const handleSelectCallType = (callType: string) => {
    setSelectedCallType(callType);
    setSelectedUnit(null);
    setSelectedIncident(null);
    setLookupOpen(false);
  };

  const handleSelectIncident = (inc: FireIncident) => {
    setSelectedIncident(inc);
  };

  const handleBackToMain = () => {
    setSelectedUnit(null);
    setSelectedCallType(null);
    setSelectedIncident(null);
  };

  const handleCloseIncidentDetail = () => {
    setSelectedIncident(null);
  };

  const handleOpenLookup = () => {
    setSearchQuery('');
    setLookupOpen(true);
  };

  // Render unit insights view
  if (selectedUnit) {
    return (
      <>
        <UnitInsightsView
          unit={selectedUnit}
          incidents={incidents}
          onBack={handleBackToMain}
          onSelectCallType={handleSelectCallType}
          onSelectUnit={handleSelectUnit}
          onSelectIncident={handleSelectIncident}
          isMobile={isMobile}
        />
        <Dialog open={selectedIncident !== null} onOpenChange={(open) => !open && handleCloseIncidentDetail()}>
          <DialogContent className="max-w-lg max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>{selectedIncident?.issue_reported}</DialogTitle>
            </DialogHeader>
            {selectedIncident && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedIncident.published_date), 'EEEE, MMMM d, yyyy h:mm a')}
                </p>
                <div>
                  <p className="text-sm font-medium mb-1">Address</p>
                  <p className="text-sm text-muted-foreground">{selectedIncident.address || 'Unknown'}</p>
                </div>
                {selectedIncident.units && selectedIncident.units.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Responding Units</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIncident.units.map((u, i) => (
                        <Button
                          key={`${u}-${i}`}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedIncident(null);
                            handleSelectUnit(u);
                          }}
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedIncident.rawTranscript && (
                  <div>
                    <p className="text-sm font-medium mb-2">Transcript</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      {selectedIncident.rawTranscript}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Render call type insights view
  if (selectedCallType) {
    return (
      <>
        <CallTypeInsightsView
          callType={selectedCallType}
          incidents={incidents}
          onBack={handleBackToMain}
          onSelectUnit={handleSelectUnit}
          onSelectIncident={handleSelectIncident}
          isMobile={isMobile}
        />
        <Dialog open={selectedIncident !== null} onOpenChange={(open) => !open && handleCloseIncidentDetail()}>
          <DialogContent className="max-w-lg max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>{selectedIncident?.issue_reported}</DialogTitle>
            </DialogHeader>
            {selectedIncident && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedIncident.published_date), 'EEEE, MMMM d, yyyy h:mm a')}
                </p>
                <div>
                  <p className="text-sm font-medium mb-1">Address</p>
                  <p className="text-sm text-muted-foreground">{selectedIncident.address || 'Unknown'}</p>
                </div>
                {selectedIncident.units && selectedIncident.units.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Responding Units</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIncident.units.map((u, i) => (
                        <Button
                          key={`${u}-${i}`}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedIncident(null);
                            handleSelectUnit(u);
                          }}
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedIncident.rawTranscript && (
                  <div>
                    <p className="text-sm font-medium mb-2">Transcript</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      {selectedIncident.rawTranscript}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <div />
        <Button variant="outline" onClick={handleOpenLookup}>
          <Search className="h-4 w-4 mr-2" />
          Look up Unit / Call Type
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Total Incidents"
          value={stats.total.toLocaleString()}
          subtext={stats.dateRange}
        />
        <SummaryCard
          label="Avg / Day"
          value={stats.avgPerDay}
          subtext={`${stats.uniqueDaysCount} days of data`}
        />
        <SummaryCard
          label="Peak Hour"
          value={stats.peakHour}
          subtext={`Busiest: ${stats.peakDayName}`}
        />
        <SummaryCard
          label="Unique Units"
          value={stats.uniqueUnitsCount.toLocaleString()}
          subtext={`${stats.avgUnitsPerIncident} avg per call`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Fire"
          value={stats.byType.fire.toLocaleString()}
          subtext={`${((stats.byType.fire / stats.total) * 100 || 0).toFixed(0)}% of total`}
        />
        <SummaryCard
          label="Medical"
          value={stats.byType.medical.toLocaleString()}
          subtext={`${((stats.byType.medical / stats.total) * 100 || 0).toFixed(0)}% of total`}
        />
        <SummaryCard
          label="Working Fires"
          value={stats.byType.workingFires.toLocaleString()}
          subtext={`${((stats.byType.workingFires / stats.total) * 100 || 0).toFixed(0)}% of total`}
        />
        <SummaryCard
          label="Busiest Day"
          value={stats.busiestDateCount.toLocaleString()}
          subtext={stats.busiestDate}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Incidents by Time of Day
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[400px]">
              <BarChart data={stats.byHour} labels={hourLabels} height={180} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Incidents by Day of Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={stats.byDay} labels={dayLabels} height={180} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Top Responding Units
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={stats.topUnits}
              onSelect={handleSelectUnit}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Call Types</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={stats.topCallTypes}
              color="bg-purple-600"
              onSelect={handleSelectCallType}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={stats.topChannels} color="bg-orange-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Has Units" percent={stats.pctWithUnits} />
            <StatRow label="Geocoded" percent={stats.pctWithAddress} />
            <StatRow label="Has Audio" percent={stats.pctWithAudio} />
            <StatRow label="Has Transcript" percent={stats.pctWithTranscript} />
          </CardContent>
        </Card>
      </div>

      {/* Lookup Dialog */}
      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Look Up</DialogTitle>
          </DialogHeader>
          <Tabs value={lookupTab} onValueChange={setLookupTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="units">Units ({stats.allUnits.length})</TabsTrigger>
              <TabsTrigger value="callTypes">Call Types ({stats.allCallTypes.length})</TabsTrigger>
            </TabsList>
            <div className="mt-4">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <TabsContent value="units" className="flex-1 mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-1 pr-4">
                  {filteredUnits.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleSelectUnit(item.label)}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-muted transition-colors text-left"
                    >
                      <span className="text-sm">{item.label}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </button>
                  ))}
                  {filteredUnits.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No units found
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="callTypes" className="flex-1 mt-4">
              <ScrollArea className="h-[300px]">
                <div className="space-y-1 pr-4">
                  {filteredCallTypes.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleSelectCallType(item.label)}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-muted transition-colors text-left"
                    >
                      <span className="text-sm truncate flex-1 mr-2">{item.label}</span>
                      <Badge variant="secondary">{item.count}</Badge>
                    </button>
                  ))}
                  {filteredCallTypes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No call types found
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
