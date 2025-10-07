"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { IncidentMap } from "@/components/IncidentMap";
import { IncidentsList } from "@/components/IncidentsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useFireIncidents } from "@/lib/api";
import { FireIncident } from "@/types/incident";
import { toast } from "sonner";

export default function Home() {
  const {
    incidents,
    error,
    lastUpdated,
    isManualRefresh,
    isLoading,
    refetch,
    setPosition,
    fetchInitial,
    resetStorage,
  } = useFireIncidents();
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(
    null
  );
  const [displayedIncidents, setDisplayedIncidents] = useState<FireIncident[]>(
    []
  );

  const handleDisplayedIncidentsChange = useCallback(
    (incidents: FireIncident[]) => {
      setDisplayedIncidents(incidents);
    },
    []
  );

  useEffect(() => {
    if (isManualRefresh && lastUpdated) {
      toast.success("Incidents refreshed successfully");
    }
  }, [isManualRefresh, lastUpdated]);

  if (isLoading) {
    return <LoadingScreen />;
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
              Real-time Austin Fire Department incidents with unit tracking
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={55} minSize={40}>
          <IncidentsList
            incidents={incidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
            onDisplayedIncidentsChange={handleDisplayedIncidentsChange}
            lastUpdated={lastUpdated}
            onRefresh={refetch}
            onFetchInitial={fetchInitial}
            onResetStorage={resetStorage}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={45} minSize={30}>
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
