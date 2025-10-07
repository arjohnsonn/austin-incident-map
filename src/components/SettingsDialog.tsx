'use client';

import { Settings } from 'lucide-react';
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
import { useSettings } from '@/lib/settings';

export function SettingsDialog() {
  const { settings, updateSettings, isLoaded } = useSettings();

  if (!isLoaded) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Open settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
