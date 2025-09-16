'use client';

import { useState, useCallback } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { FireMap } from '@/components/FireMap';
import { IncidentsList } from '@/components/IncidentsList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useFireIncidents } from '@/lib/api';
import { FireIncident } from '@/types/incident';

export default function Home() {
  const { incidents, loading, error } = useFireIncidents();
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(null);
  const [displayedIncidents, setDisplayedIncidents] = useState<FireIncident[]>([]);

  const handleDisplayedIncidentsChange = useCallback((incidents: FireIncident[]) => {
    setDisplayedIncidents(incidents);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading fire incidents...</div>
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
            <h1 className="text-2xl font-bold">Austin Fire Incidents Map</h1>
            <p className="text-muted-foreground">
              Real-time fire, rescue, and hazmat incidents in Austin and Travis County
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={40} minSize={30}>
          <IncidentsList
            incidents={incidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
            onDisplayedIncidentsChange={handleDisplayedIncidentsChange}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={60} minSize={50}>
          <FireMap
            incidents={displayedIncidents.length > 0 ? displayedIncidents : incidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
