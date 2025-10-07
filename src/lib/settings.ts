import { useState, useEffect } from 'react';

export interface AppSettings {
  autoPlayAudio: boolean;
  showBanner: boolean;
}

const SETTINGS_KEY = 'app_settings';

const defaultSettings: AppSettings = {
  autoPlayAudio: false,
  showBanner: true,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppSettings;
        setSettings(parsed);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
      return updated;
    });
  };

  return {
    settings,
    updateSettings,
    isLoaded,
  };
}
