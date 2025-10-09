"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncidentMap } from "@/components/IncidentMap";
import { IncidentsList } from "@/components/IncidentsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsDialog } from "@/components/SettingsDialog";
import { CallBanner } from "@/components/CallBanner";
import { useFireIncidents } from "@/lib/api";
import { useSettings, SettingsProvider } from "@/lib/settings";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { FireIncident } from "@/types/incident";
import { toast } from "sonner";

function HomeContent() {
  const {
    incidents,
    error,
    lastUpdated,
    isManualRefresh,
    isLoading,
    refetch,
    resetStorage,
  } = useFireIncidents();
  const { settings } = useSettings();
  const isMobile = useMediaQuery("(max-width: 768px)");
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
  const [replayingIncident, setReplayingIncident] =
    useState<FireIncident | null>(null);
  const [replayInjectedIncidents, setReplayInjectedIncidents] = useState<
    FireIncident[]
  >([]);
  const [newIncidentIds, setNewIncidentIds] = useState<Set<string>>(new Set());

  const finalIncidents = useMemo(() => {
    const idsToFilter = new Set([
      ...(replayingIncident ? [replayingIncident.traffic_report_id] : []),
      ...replayInjectedIncidents.map((inc) => inc.traffic_report_id),
    ]);

    const filtered =
      idsToFilter.size > 0
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
    (incident: FireIncident, newIds: Set<string>) => {
      setNewIncidentIds(newIds);
      if (settings.showBanner) {
        setBannerIncident(incident);
      }

      setTimeout(() => {
        setNewIncidentIds(new Set());
      }, 1500);
    },
    [settings.showBanner]
  );

  const handleAudioStateChange = useCallback((playing: boolean) => {
    setIsAudioPlaying(playing);
  }, []);

  const handleReplayIncident = useCallback(
    (incident: FireIncident) => {
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
    },
    [replayingIncident]
  );

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
      <header className="border-b px-4 py-2 md:px-6 md:py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl font-bold truncate">
              Austin Fire Department Map
            </h1>
            <p className="text-muted-foreground text-sm hidden md:block">
              Real-time Austin Fire Department incidents with unit tracking
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SettingsDialog
              incidents={incidents}
              onReplayIncident={handleReplayIncident}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

{isMobile ? (
        <Tabs defaultValue="list" className="flex-1 flex flex-col">
          <TabsList className="w-full rounded-none border-b h-12">
            <TabsTrigger value="list" className="flex-1 h-full">
              Incidents
            </TabsTrigger>
            <TabsTrigger value="map" className="flex-1 h-full">
              Map
            </TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="flex-1 m-0 overflow-hidden">
            <IncidentsList
              incidents={finalIncidents}
              selectedIncident={selectedIncident}
              onIncidentSelect={setSelectedIncident}
              onDisplayedIncidentsChange={handleDisplayedIncidentsChange}
              onNewIncident={handleNewIncident}
              onAudioStateChange={handleAudioStateChange}
              loading={isLoading}
              lastUpdated={lastUpdated}
              onRefresh={refetch}
              onResetStorage={resetStorage}
            />
          </TabsContent>
          <TabsContent value="map" className="flex-1 m-0 overflow-hidden">
            <IncidentMap
              incidents={displayedIncidents}
              selectedIncident={selectedIncident}
              onIncidentSelect={setSelectedIncident}
              newIncidentIds={newIncidentIds}
            />
          </TabsContent>
        </Tabs>
      ) : (
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
              onRefresh={refetch}
              onResetStorage={resetStorage}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={45} minSize={30}>
            <IncidentMap
              incidents={displayedIncidents}
              selectedIncident={selectedIncident}
              onIncidentSelect={setSelectedIncident}
              newIncidentIds={newIncidentIds}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <HomeContent />
    </SettingsProvider>
  );
}
