"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { IncidentMap } from "@/components/IncidentMap";
import { IncidentsList } from "@/components/IncidentsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsDialog } from "@/components/SettingsDialog";
import { CallBanner } from "@/components/CallBanner";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useFireIncidents } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { FireIncident } from "@/types/incident";
import { toast } from "sonner";

export default function Home() {
  const {
    incidents,
    error,
    lastUpdated,
    isManualRefresh,
    isLoading,
    processingState,
    isInitialStream,
    refetch,
    setPosition,
    fetchInitial,
    resetStorage,
  } = useFireIncidents();
  const { settings } = useSettings();
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(
    null
  );
  const [displayedIncidents, setDisplayedIncidents] = useState<FireIncident[]>(
    []
  );
  const [bannerIncident, setBannerIncident] = useState<FireIncident | null>(
    null
  );
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [replayingIncident, setReplayingIncident] = useState<FireIncident | null>(
    null
  );
  const [replayInjectedIncidents, setReplayInjectedIncidents] = useState<FireIncident[]>(
    []
  );

  const finalIncidents = useMemo(() => {
    const idsToFilter = new Set([
      ...(replayingIncident ? [replayingIncident.traffic_report_id] : []),
      ...replayInjectedIncidents.map(inc => inc.traffic_report_id)
    ]);

    const filtered = idsToFilter.size > 0
      ? incidents.filter((inc) => !idsToFilter.has(inc.traffic_report_id))
      : incidents;

    return [...replayInjectedIncidents, ...filtered];
  }, [incidents, replayingIncident, replayInjectedIncidents]);

  const handleDisplayedIncidentsChange = useCallback(
    (incidents: FireIncident[]) => {
      setDisplayedIncidents(incidents);
    },
    []
  );

  const handleNewIncident = useCallback(
    (incident: FireIncident) => {
      if (settings.showBanner) {
        setBannerIncident(incident);
      }
    },
    [settings.showBanner]
  );

  const handleAudioStateChange = useCallback((playing: boolean) => {
    setIsAudioPlaying(playing);
  }, []);

  const handleReplayIncident = useCallback((incident: FireIncident) => {
    if (replayingIncident) {
      toast.error("A replay is already in progress");
      return;
    }

    setReplayingIncident(incident);
    setReplayInjectedIncidents([]);

    setTimeout(() => {
      setReplayInjectedIncidents([incident]);
      setReplayingIncident(null);
    }, 3000);

    setTimeout(() => {
      setReplayInjectedIncidents([]);
    }, 10000);
  }, [replayingIncident]);

  useEffect(() => {
    if (isManualRefresh && lastUpdated) {
      toast.success("Incidents refreshed successfully");
    }
  }, [isManualRefresh, lastUpdated]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-destructive">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <CallBanner
        incident={bannerIncident}
        onComplete={() => setBannerIncident(null)}
        isAudioPlaying={isAudioPlaying}
      />
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Austin Incident Map</h1>
            <p className="text-muted-foreground">
              Real-time Austin Fire Department incidents with unit tracking
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SettingsDialog
              incidents={incidents}
              onReplayIncident={handleReplayIncident}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={55} minSize={40}>
          <IncidentsList
            incidents={finalIncidents}
            selectedIncident={selectedIncident}
            onIncidentSelect={setSelectedIncident}
            onDisplayedIncidentsChange={handleDisplayedIncidentsChange}
            onNewIncident={handleNewIncident}
            onAudioStateChange={handleAudioStateChange}
            loading={isLoading}
            lastUpdated={lastUpdated}
            processingState={processingState}
            isInitialStream={isInitialStream}
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
