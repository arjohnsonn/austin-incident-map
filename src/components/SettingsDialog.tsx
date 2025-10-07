'use client';

import { Settings, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSettings } from '@/lib/settings';
import { FireIncident } from '@/types/incident';
import { format } from 'date-fns';
import { useState } from 'react';

interface SettingsDialogProps {
  incidents?: FireIncident[];
  onReplayIncident?: (incident: FireIncident) => void;
}

export function SettingsDialog({ incidents = [], onReplayIncident }: SettingsDialogProps) {
  const { settings, updateSettings, isLoaded } = useSettings();
  const [open, setOpen] = useState(false);

  if (!isLoaded) return null;

  const handleReplay = (incident: FireIncident) => {
    setOpen(false);
    onReplayIncident?.(incident);
  };

  const recentIncidents = incidents.slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Open settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your incident notification preferences
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label htmlFor="auto-play" className="text-sm font-medium">
                Auto-play audio
              </label>
              <p className="text-sm text-muted-foreground">
                Automatically play dispatch audio when new calls arrive
              </p>
            </div>
            <Switch
              id="auto-play"
              checked={settings.autoPlayAudio}
              onCheckedChange={(checked) =>
                updateSettings({ autoPlayAudio: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label htmlFor="show-banner" className="text-sm font-medium">
                Show notification banner
              </label>
              <p className="text-sm text-muted-foreground">
                Display a cycling banner at the top when new calls arrive
              </p>
            </div>
            <Switch
              id="show-banner"
              checked={settings.showBanner}
              onCheckedChange={(checked) =>
                updateSettings({ showBanner: checked })
              }
            />
          </div>

          {recentIncidents.length > 0 && (
            <div className="border-t pt-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Debug: Replay Incident</h3>
                <p className="text-xs text-muted-foreground">
                  Click an incident to replay it as if it just arrived
                </p>
                <ScrollArea className="h-[300px] rounded border">
                  <div className="p-2 space-y-1">
                    {recentIncidents.map((incident) => (
                      <button
                        key={incident.traffic_report_id}
                        onClick={() => handleReplay(incident)}
                        className="w-full flex items-center gap-2 p-2 text-left text-xs hover:bg-accent rounded transition-colors"
                      >
                        <Play className="h-3 w-3 flex-shrink-0" />
                        <span className="text-muted-foreground font-mono flex-shrink-0">
                          {format(new Date(incident.published_date), 'MM/dd HH:mm')}
                        </span>
                        <span className="font-medium truncate flex-1">
                          {incident.issue_reported}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {incident.address || '?'}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
