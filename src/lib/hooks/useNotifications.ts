'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AppSettings } from '@/lib/settings';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export interface PushDebugLog {
  time: string;
  message: string;
  level: 'info' | 'error' | 'success';
}

export interface PushDebugInfo {
  swSupported: boolean;
  swState: 'pending' | 'registered' | 'failed';
  swError: string | null;
  swActiveState: string | null;
  pushManagerSupported: boolean;
  notificationPermission: NotificationPermissionState;
  isSubscribed: boolean;
  vapidKeyPresent: boolean;
  subscriptionEndpoint: string | null;
  logs: PushDebugLog[];
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PushDebugInfo>({
    swSupported: false,
    swState: 'pending',
    swError: null,
    swActiveState: null,
    pushManagerSupported: false,
    notificationPermission: 'default',
    isSubscribed: false,
    vapidKeyPresent: false,
    subscriptionEndpoint: null,
    logs: [],
  });
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  const log = useCallback((message: string, level: PushDebugLog['level'] = 'info') => {
    const entry: PushDebugLog = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      message,
      level,
    };
    setDebugInfo((prev) => ({ ...prev, logs: [...prev.logs.slice(-49), entry] }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasSW = 'serviceWorker' in navigator;
    const hasNotification = 'Notification' in window;
    const hasPush = 'PushManager' in window;
    const perm = hasNotification ? (Notification.permission as NotificationPermissionState) : 'default';

    if (hasNotification) setPermission(perm);

    setDebugInfo((prev) => ({
      ...prev,
      swSupported: hasSW,
      pushManagerSupported: hasPush,
      notificationPermission: perm,
      vapidKeyPresent: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    }));

    log(`Init: SW=${hasSW} Push=${hasPush} Notif=${hasNotification} Perm=${perm}`);
    log(`VAPID key: ${process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'present (' + process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.length + ' chars)' : 'MISSING'}`);

    if (!hasSW) {
      log('Service workers not supported', 'error');
      setDebugInfo((prev) => ({ ...prev, swState: 'failed', swError: 'Not supported' }));
      return;
    }

    log('Registering service worker...');

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        swRegistration.current = reg;
        const activeState = reg.active?.state || reg.installing?.state || reg.waiting?.state || 'none';
        log(`SW registered. active=${reg.active?.state || 'null'} installing=${reg.installing?.state || 'null'} waiting=${reg.waiting?.state || 'null'}`, 'success');

        setDebugInfo((prev) => ({
          ...prev,
          swState: 'registered',
          swActiveState: activeState,
        }));

        try {
          const existing = await reg.pushManager.getSubscription();
          const subbed = !!existing;
          setIsSubscribed(subbed);
          setDebugInfo((prev) => ({
            ...prev,
            isSubscribed: subbed,
            subscriptionEndpoint: existing?.endpoint || null,
          }));
          log(`Existing subscription: ${subbed ? existing!.endpoint.substring(0, 50) + '...' : 'none'}`);
        } catch (err) {
          log(`getSubscription failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`SW registration failed: ${msg}`, 'error');
        setDebugInfo((prev) => ({ ...prev, swState: 'failed', swError: msg }));
      });

    log('Waiting for navigator.serviceWorker.ready...');
    navigator.serviceWorker.ready.then((reg) => {
      log(`SW ready! active=${reg.active?.state || 'null'}`, 'success');
      swRegistration.current = reg;
      setDebugInfo((prev) => ({ ...prev, swActiveState: reg.active?.state || 'unknown' }));
    });
  }, [log]);

  const getRegistration = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (swRegistration.current?.active) {
      log(`Using cached registration (active=${swRegistration.current.active.state})`);
      return swRegistration.current;
    }

    if (!('serviceWorker' in navigator)) {
      log('No serviceWorker in navigator', 'error');
      return null;
    }

    try {
      log('Awaiting navigator.serviceWorker.ready...');
      const reg = await navigator.serviceWorker.ready;
      log(`Got ready registration. active=${reg.active?.state || 'null'}`, 'success');
      swRegistration.current = reg;
      return reg;
    } catch (err) {
      log(`serviceWorker.ready failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return null;
    }
  }, [log]);

  const subscribe = useCallback(
    async (settings: AppSettings): Promise<{ success: boolean; error?: string }> => {
      log('Subscribe called');

      if (!('serviceWorker' in navigator)) {
        log('No serviceWorker support', 'error');
        return { success: false, error: 'Service workers not supported' };
      }

      if (!('PushManager' in window)) {
        log('No PushManager support', 'error');
        return { success: false, error: 'Push notifications not supported on this browser' };
      }

      log('Getting registration...');
      const reg = await getRegistration();
      if (!reg) {
        log('Failed to get registration', 'error');
        return { success: false, error: 'Service worker not ready' };
      }
      log(`Got registration. active=${reg.active?.state || 'null'} scope=${reg.scope}`);

      log('Requesting notification permission...');
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      log(`Permission result: ${result}`);
      if (result !== 'granted') {
        return { success: false, error: 'Notification permission denied' };
      }

      try {
        log('Checking existing push subscription...');
        let sub = await reg.pushManager.getSubscription();
        log(`Existing sub: ${sub ? 'yes' : 'no'}`);

        if (!sub) {
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapidKey) {
            log('VAPID key missing', 'error');
            return { success: false, error: 'VAPID key not configured' };
          }
          log(`Creating push subscription with VAPID (${vapidKey.length} chars)...`);

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
          log(`Push subscription created: ${sub.endpoint.substring(0, 50)}...`, 'success');
        }

        log('Sending subscription to server...');
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
          const errMsg = data.error || `Server error (${res.status})`;
          log(`Server rejected: ${errMsg}`, 'error');
          return { success: false, error: errMsg };
        }

        log('Subscription saved to server', 'success');
        setIsSubscribed(true);
        setDebugInfo((prev) => ({
          ...prev,
          isSubscribed: true,
          subscriptionEndpoint: sub!.endpoint,
        }));
        return { success: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`Subscribe error: ${errMsg}`, 'error');
        return { success: false, error: errMsg };
      }
    },
    [getRegistration, log]
  );

  const unsubscribe = useCallback(async (): Promise<void> => {
    log('Unsubscribe called');
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
        log('Unsubscribed', 'success');
      }
      setIsSubscribed(false);
      setDebugInfo((prev) => ({ ...prev, isSubscribed: false, subscriptionEndpoint: null }));
    } catch (err) {
      log(`Unsubscribe error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [getRegistration, log]);

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
          log(`Filter sync failed: ${res.status}`, 'error');
        }
      } catch (err) {
        log(`Filter sync error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    },
    [isSubscribed, getRegistration, log]
  );

  return { permission, isSubscribed, subscribe, unsubscribe, syncFilters, debugInfo };
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
