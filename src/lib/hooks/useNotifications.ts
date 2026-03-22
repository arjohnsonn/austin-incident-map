'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppSettings } from '@/lib/settings';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const swReadyPromise = useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission as NotificationPermissionState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    swReadyPromise.current = navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        swRegistration.current = reg;
        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existing);
        return reg;
      });
  }, []);

  const getRegistration = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (swRegistration.current) return swRegistration.current;
    if (swReadyPromise.current) {
      try {
        return await swReadyPromise.current;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const subscribe = useCallback(
    async (settings: AppSettings): Promise<{ success: boolean; error?: string }> => {
      if (!('serviceWorker' in navigator)) {
        return { success: false, error: 'Service workers not supported' };
      }

      if (!('PushManager' in window)) {
        return { success: false, error: 'Push notifications not supported on this browser' };
      }

      const reg = await getRegistration();
      if (!reg) {
        return { success: false, error: 'Service worker not ready' };
      }

      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      if (result !== 'granted') {
        return { success: false, error: 'Notification permission denied' };
      }

      try {
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapidKey) {
            return { success: false, error: 'VAPID key not configured' };
          }

          sub = await reg.pushManager.subscribe({
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

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { success: false, error: data.error || `Server error (${res.status})` };
        }

        setIsSubscribed(true);
        return { success: true };
      } catch (err) {
        console.error('Push subscription failed:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    },
    [getRegistration]
  );

  const unsubscribe = useCallback(async (): Promise<void> => {
    const reg = await getRegistration();
    if (!reg) return;

    try {
      const sub = await reg.pushManager.getSubscription();
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
  }, [getRegistration]);

  const syncFilters = useCallback(
    async (settings: AppSettings) => {
      if (!isSubscribed) return;

      const reg = await getRegistration();
      if (!reg) return;

      const sub = await reg.pushManager.getSubscription();
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
    [isSubscribed, getRegistration]
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
