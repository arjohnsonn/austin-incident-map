"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export function LoadingScreen() {
  const [dots, setDots] = useState("");
  const [estimatedTime, setEstimatedTime] = useState(90);

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);

    return () => clearInterval(dotsInterval);
  }, []);

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setEstimatedTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-950">
      <div className="flex flex-col items-center gap-6 p-8 rounded-lg bg-white dark:bg-neutral-800 shadow-lg max-w-md w-full mx-4">
        <div className="relative">
          <Spinner className="w-16 h-16 text-blue-600 dark:text-blue-400" />
          <div className="absolute inset-0 rounded-full bg-blue-500/10 dark:bg-blue-400/10 animate-ping" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Loading Incidents{dots}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Processing dispatch calls and geocoding addresses
          </p>
        </div>

        <div className="w-full space-y-3">
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 animate-pulse"
              style={{
                width: estimatedTime > 0 ? `${((90 - estimatedTime) / 90) * 100}%` : '100%',
                transition: 'width 1s linear'
              }}
            />
          </div>

          <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <span>Estimated time remaining</span>
            <span className="font-mono">{estimatedTime}s</span>
          </div>
        </div>

        <div className="text-xs text-center text-neutral-500 dark:text-neutral-400 space-y-1">
          <p>✓ Fetching calls from Broadcastify</p>
          <p>✓ Transcribing dispatch audio</p>
          <p>✓ Parsing incident details</p>
          <p>✓ Geocoding addresses</p>
        </div>

        <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
          First load takes 30-90 seconds. Subsequent loads will be instant.
        </p>
      </div>
    </div>
  );
}
