'use client';

import { Settings, Play, Bell, BellOff, X, Plus } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/lib/settings';
import { useNotifications, type NotificationPermissionState, type PushDebugInfo, type PushDebugLog } from '@/lib/hooks/useNotifications';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FireIncident } from '@/types/incident';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react';

interface SettingsDialogProps {
  incidents?: FireIncident[];
  onReplayIncident?: (incident: FireIncident) => void;
}

const COMMON_CALL_TYPES = [
  'Structure Fire',
  'Box Alarm',
  'Working Fire',
  'Vehicle Fire',
  'Dumpster Fire',
  'Chest Pain',
  'Cardiac Arrest',
  'Stroke',
  'Fall',
  'MVC',
  'Hazmat',
  'Rescue',
  'Gas Leak',
];

const INCIDENT_TYPE_OPTIONS: { value: 'fire' | 'medical' | 'traffic'; label: string }[] = [
  { value: 'fire', label: 'Fire' },
  { value: 'medical', label: 'Medical' },
  { value: 'traffic', label: 'Traffic' },
];

function TagInput({
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const addValue = useCallback(
    (val: string) => {
      const trimmed = val.trim();
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInput('');
      setShowSuggestions(false);
    },
    [values, onChange]
  );

  const removeValue = useCallback(
    (val: string) => {
      onChange(values.filter((v) => v !== val));
    },
    [values, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      addValue(input);
    }
  };

  const filteredSuggestions = suggestions?.filter(
    (s) =>
      !values.includes(s) &&
      s.toLowerCase().includes(input.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((val) => (
            <Badge key={val} variant="secondary" className="gap-1 pr-1">
              {val}
              <button
                onClick={() => removeValue(val)}
                className="rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="relative">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        {showSuggestions && filteredSuggestions && filteredSuggestions.length > 0 && input.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-32 overflow-y-auto">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addValue(s)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                <Plus className="h-3 w-3 text-muted-foreground" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsDialog({ incidents = [], onReplayIncident }: SettingsDialogProps) {
  const { settings, updateSettings, isLoaded } = useSettings();
  const { permission, isSubscribed, subscribe, unsubscribe, syncFilters, debugInfo } = useNotifications();
  const [open, setOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync filter changes to the server (debounced)
  useEffect(() => {
    if (!isSubscribed || !settings.notificationsEnabled) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncFilters(settings);
    }, 1000);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [
    isSubscribed,
    settings.notificationsEnabled,
    settings.notifyAllCalls,
    settings.notifyCallTypes,
    settings.notifyUnits,
    settings.notifyIncidentTypes,
    syncFilters,
  ]);

  if (!isLoaded) return null;

  const handleReplay = (incident: FireIncident) => {
    setOpen(false);
    onReplayIncident?.(incident);
  };

  const handleEnableNotifications = async (checked: boolean) => {
    if (subscribing) return;
    if (checked) {
      if (permission === 'denied') return;
      setSubscribing(true);
      const result = await subscribe(settings);
      setSubscribing(false);
      if (result.success) {
        updateSettings({ notificationsEnabled: true });
      } else {
        toast.error(result.error || 'Failed to enable notifications');
      }
    } else {
      await unsubscribe();
      updateSettings({ notificationsEnabled: false });
    }
  };

  const permissionLabel = (perm: NotificationPermissionState) => {
    switch (perm) {
      case 'granted': return null;
      case 'denied': return 'Blocked by browser — enable in site settings';
      default: return null;
    }
  };

  const recentIncidents = incidents.slice(0, 20);

  const knownUnits = Array.from(
    new Set(incidents.flatMap((i) => i.units || []))
  ).sort();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Open settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your incident notification preferences
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="settings" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="console">Console</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="flex-1 min-h-0">
        <ScrollArea className="h-full -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* General Settings */}
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

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="hide-incomplete" className="text-sm font-medium">
                  Hide incomplete incidents
                </label>
                <p className="text-sm text-muted-foreground">
                  Hide incidents when all fields are missing
                </p>
              </div>
              <Switch
                id="hide-incomplete"
                checked={settings.hideIncompleteIncidents}
                onCheckedChange={(checked) =>
                  updateSettings({ hideIncompleteIncidents: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="hide-no-units-calltype" className="text-sm font-medium">
                  Hide incidents without units and call type
                </label>
                <p className="text-sm text-muted-foreground">
                  Hide incidents missing both units and call type
                </p>
              </div>
              <Switch
                id="hide-no-units-calltype"
                checked={settings.hideIncidentsWithoutUnitsOrCallType}
                onCheckedChange={(checked) =>
                  updateSettings({ hideIncidentsWithoutUnitsOrCallType: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="show-download" className="text-sm font-medium">
                  Show download button
                </label>
                <p className="text-sm text-muted-foreground">
                  Show a download button to save dispatch audio files
                </p>
              </div>
              <Switch
                id="show-download"
                checked={settings.showDownloadButton}
                onCheckedChange={(checked) =>
                  updateSettings({ showDownloadButton: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="show-debug-replay" className="text-sm font-medium">
                  Show debug replay
                </label>
                <p className="text-sm text-muted-foreground">
                  Show incident replay tool for testing notifications
                </p>
              </div>
              <Switch
                id="show-debug-replay"
                checked={settings.showDebugReplay}
                onCheckedChange={(checked) =>
                  updateSettings({ showDebugReplay: checked })
                }
              />
            </div>

            <Separator />

            {/* Push Notifications */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {settings.notificationsEnabled ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
                <h3 className="text-sm font-semibold">Push Notifications</h3>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label htmlFor="notifications-enabled" className="text-sm font-medium">
                    Enable push notifications
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new calls match your filters
                  </p>
                  {permissionLabel(permission) && (
                    <p className="text-xs text-destructive">
                      {permissionLabel(permission)}
                    </p>
                  )}
                </div>
                <Switch
                  id="notifications-enabled"
                  checked={settings.notificationsEnabled}
                  onCheckedChange={handleEnableNotifications}
                  disabled={permission === 'denied' || subscribing}
                />
              </div>

              {settings.notificationsEnabled && (
                <div className="space-y-4 pl-1">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <label htmlFor="notify-all" className="text-sm font-medium">
                        All calls
                      </label>
                      <p className="text-sm text-muted-foreground">
                        Notify for every new incident
                      </p>
                    </div>
                    <Switch
                      id="notify-all"
                      checked={settings.notifyAllCalls}
                      onCheckedChange={(checked) =>
                        updateSettings({ notifyAllCalls: checked })
                      }
                    />
                  </div>

                  {!settings.notifyAllCalls && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Incident categories</label>
                        <p className="text-xs text-muted-foreground">
                          Notify when the incident matches any selected category
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {INCIDENT_TYPE_OPTIONS.map((opt) => {
                            const active = settings.notifyIncidentTypes.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  const next = active
                                    ? settings.notifyIncidentTypes.filter((t) => t !== opt.value)
                                    : [...settings.notifyIncidentTypes, opt.value];
                                  updateSettings({ notifyIncidentTypes: next });
                                }}
                                className={`inline-flex items-center rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                                  active
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-foreground hover:bg-accent'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Call types</label>
                        <p className="text-xs text-muted-foreground">
                          Notify when the call type contains any of these terms
                        </p>
                        <TagInput
                          values={settings.notifyCallTypes}
                          onChange={(v) => updateSettings({ notifyCallTypes: v })}
                          placeholder="Type a call type and press Enter..."
                          suggestions={COMMON_CALL_TYPES}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Units</label>
                        <p className="text-xs text-muted-foreground">
                          Notify when any of these units are dispatched
                        </p>
                        <TagInput
                          values={settings.notifyUnits}
                          onChange={(v) => updateSettings({ notifyUnits: v })}
                          placeholder="Type a unit name and press Enter..."
                          suggestions={knownUnits}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground italic">
                        A notification is sent if the incident matches any of the above filters.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {settings.showDebugReplay && recentIncidents.length > 0 && (
              <>
                <Separator />
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
              </>
            )}
          </div>
        </ScrollArea>
          </TabsContent>
          <TabsContent value="debug" className="flex-1 min-h-0">
            <DebugPanel debugInfo={debugInfo} permission={permission} isSubscribed={isSubscribed} />
          </TabsContent>
          <TabsContent value="console" className="flex-1 min-h-0">
            <ConsolePanel logs={debugInfo.logs} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DebugPanel({
  debugInfo,
  permission,
  isSubscribed,
}: {
  debugInfo: PushDebugInfo;
  permission: NotificationPermissionState;
  isSubscribed: boolean;
}) {
  const rows: { label: string; value: string; status: 'ok' | 'warn' | 'error' | 'neutral' }[] = [
    {
      label: 'Service Worker Support',
      value: debugInfo.swSupported ? 'Supported' : 'Not supported',
      status: debugInfo.swSupported ? 'ok' : 'error',
    },
    {
      label: 'Service Worker State',
      value: debugInfo.swState === 'registered'
        ? 'Registered'
        : debugInfo.swState === 'failed'
          ? `Failed: ${debugInfo.swError}`
          : 'Pending...',
      status: debugInfo.swState === 'registered' ? 'ok' : debugInfo.swState === 'failed' ? 'error' : 'warn',
    },
    {
      label: 'SW Active State',
      value: debugInfo.swActiveState || 'none',
      status: debugInfo.swActiveState === 'activated' ? 'ok' : 'warn',
    },
    {
      label: 'PushManager Support',
      value: debugInfo.pushManagerSupported ? 'Supported' : 'Not supported',
      status: debugInfo.pushManagerSupported ? 'ok' : 'error',
    },
    {
      label: 'Notification Permission',
      value: permission,
      status: permission === 'granted' ? 'ok' : permission === 'denied' ? 'error' : 'warn',
    },
    {
      label: 'VAPID Key',
      value: debugInfo.vapidKeyPresent ? 'Present' : 'Missing',
      status: debugInfo.vapidKeyPresent ? 'ok' : 'error',
    },
    {
      label: 'Push Subscription',
      value: isSubscribed ? 'Active' : 'Not subscribed',
      status: isSubscribed ? 'ok' : 'neutral',
    },
    {
      label: 'Subscription Endpoint',
      value: debugInfo.subscriptionEndpoint
        ? debugInfo.subscriptionEndpoint.substring(0, 60) + '...'
        : 'None',
      status: debugInfo.subscriptionEndpoint ? 'ok' : 'neutral',
    },
    {
      label: 'Protocol',
      value: typeof window !== 'undefined' ? window.location.protocol : '?',
      status: typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'ok' : 'error',
    },
    {
      label: 'Display Mode',
      value: typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
        ? 'Standalone (PWA)'
        : 'Browser tab',
      status: 'neutral',
    },
  ];

  const statusColors = {
    ok: 'text-green-500',
    warn: 'text-yellow-500',
    error: 'text-red-500',
    neutral: 'text-muted-foreground',
  };

  const statusDots = {
    ok: 'bg-green-500',
    warn: 'bg-yellow-500',
    error: 'bg-red-500',
    neutral: 'bg-muted-foreground',
  };

  return (
    <ScrollArea className="h-full -mx-6 px-6">
      <div className="space-y-3 py-4">
        <p className="text-xs text-muted-foreground">
          Push notification diagnostic info. Share this if reporting issues.
        </p>
        <div className="rounded-md border divide-y">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-3 px-3 py-2 text-xs">
              <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${statusDots[row.status]}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{row.label}</div>
                <div className={`break-all ${statusColors[row.status]}`}>{row.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs font-medium mb-1">User Agent</div>
          <div className="text-xs text-muted-foreground break-all font-mono">
            {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function ConsolePanel({ logs }: { logs: PushDebugLog[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="rounded-md border bg-black/50 p-2 h-[400px] overflow-y-auto font-mono text-[11px] leading-5 -mx-6 mx-0">
      {logs.length === 0 ? (
        <div className="text-muted-foreground p-2">No logs yet. Toggle notifications to see activity.</div>
      ) : (
        logs.map((entry, i) => (
          <div key={i} className="flex gap-2 px-1 hover:bg-white/5">
            <span className="text-muted-foreground flex-shrink-0">{entry.time}</span>
            <span className={
              entry.level === 'error' ? 'text-red-400' :
              entry.level === 'success' ? 'text-green-400' :
              'text-gray-300'
            }>{entry.message}</span>
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
