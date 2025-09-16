'use client';

import { useState, useCallback, useEffect } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { IncidentMap } from '@/components/IncidentMap';
import { IncidentsList } from '@/components/IncidentsList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useFireIncidents } from '@/lib/api';
import { FireIncident } from '@/types/incident';

export default function Home() {
  const { incidents, loading, error, lastUpdated, refetch } = useFireIncidents();
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(null);
  const [displayedIncidents, setDisplayedIncidents] = useState<FireIncident[]>([]);

  const handleDisplayedIncidentsChange = useCallback((incidents: FireIncident[]) => {
    setDisplayedIncidents(incidents);
  }, []);

  // Initialize displayedIncidents with all incidents when first loaded
  useEffect(() => {
    if (incidents.length > 0 && displayedIncidents.length === 0) {
      // Since data is now ordered by date descending, just take the first 50 for initial display
      // The filtering component will handle showing the right mix based on date ranges
      setDisplayedIncidents(incidents.slice(0, 50));
    }
  }, [incidents, displayedIncidents.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading incidents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-destructive">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Austin Incident Map</h1>
            <p className="text-muted-foreground">
              Real-time fire, rescue, hazmat, and traffic incidents in Austin and Travis County
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={40} minSize={40}>
          <IncidentsList
            incidents={incidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
            onDisplayedIncidentsChange={handleDisplayedIncidentsChange}
            loading={loading}
            lastUpdated={lastUpdated}
            onRefresh={refetch}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={50} minSize={30}>
          <IncidentMap
            incidents={displayedIncidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
