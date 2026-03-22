'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppSettings } from '@/lib/settings';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission as NotificationPermissionState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        swRegistration.current = reg;

        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existing);
      });
  }, []);

  const subscribe = useCallback(
    async (settings: AppSettings): Promise<boolean> => {
      if (!swRegistration.current) return false;

      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      if (result !== 'granted') return false;

      try {
        let sub = await swRegistration.current.pushManager.getSubscription();

        if (!sub) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapidKey) return false;

          sub = await swRegistration.current.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        }

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            filters: {
              notifyAllCalls: settings.notifyAllCalls,
              notifyCallTypes: settings.notifyCallTypes,
              notifyUnits: settings.notifyUnits,
              notifyIncidentTypes: settings.notifyIncidentTypes,
            },
          }),
        });

        if (!res.ok) return false;

        setIsSubscribed(true);
        return true;
      } catch (err) {
        console.error('Push subscription failed:', err);
        return false;
      }
    },
    []
  );

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swRegistration.current) return;

    try {
      const sub = await swRegistration.current.pushManager.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
          }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
  }, []);

  const syncFilters = useCallback(
    async (settings: AppSettings) => {
      if (!isSubscribed || !swRegistration.current) return;

      const sub = await swRegistration.current.pushManager.getSubscription();
      if (!sub) return;

      try {
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            filters: {
              notifyAllCalls: settings.notifyAllCalls,
              notifyCallTypes: settings.notifyCallTypes,
              notifyUnits: settings.notifyUnits,
              notifyIncidentTypes: settings.notifyIncidentTypes,
            },
          }),
        });

        if (!res.ok) {
          console.error('Failed to sync notification filters:', res.status);
        }
      } catch (err) {
        console.error('Failed to sync notification filters:', err);
      }
    },
    [isSubscribed]
  );

  return { permission, isSubscribed, subscribe, unsubscribe, syncFilters };
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}
