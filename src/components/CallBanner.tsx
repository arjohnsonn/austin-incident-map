'use client';

import { useState, useEffect } from 'react';
import { FireIncident } from '@/types/incident';

interface CallBannerProps {
  incident: FireIncident | null;
  onComplete: () => void;
  isAudioPlaying: boolean;
}

export function CallBanner({ incident, onComplete, isAudioPlaying }: CallBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    if (!incident) {
      setCurrentIndex(0);
      setCycleCount(0);
      return;
    }

    const items = [
      (incident.issue_reported === '?' ? 'Nondeterminate' : incident.issue_reported) || 'Unknown Call Type',
      (incident.address === '?' ? 'Nondeterminate' : incident.address) || 'Unknown Address',
      incident.units?.join(', ') || 'No Units',
      incident.channels?.join(', ') || 'No Channel',
    ];

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= items.length) {
          setCycleCount((count) => {
            const newCount = count + 1;
            if (newCount >= 3 && !isAudioPlaying) {
              setTimeout(() => {
                onComplete();
              }, 3000);
            }
            return newCount;
          });
          return 0;
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [incident, onComplete, isAudioPlaying]);

  useEffect(() => {
    if (!isAudioPlaying && cycleCount >= 3 && incident) {
      onComplete();
    }
  }, [isAudioPlaying, cycleCount, incident, onComplete]);

  if (!incident || (cycleCount >= 3 && !isAudioPlaying)) return null;

  const items = [
    { label: 'CALL TYPE', value: (incident.issue_reported === '?' ? 'Nondeterminate' : incident.issue_reported) || 'Unknown Call Type' },
    { label: 'ADDRESS', value: (incident.address === '?' ? 'Nondeterminate' : incident.address) || 'Unknown Address' },
    { label: 'UNITS', value: incident.units?.join(', ') || 'No Units' },
    { label: 'CHANNEL', value: incident.channels?.join(', ') || 'No Channel' },
  ];

  const currentItem = items[currentIndex];

  const bgColor =
    incident.incidentType === 'fire'
      ? 'bg-red-600'
      : incident.incidentType === 'medical'
      ? 'bg-[#959F1E]'
      : 'bg-yellow-500';

  return (
    <div
      className={`fixed top-0 left-0 right-0 ${bgColor} text-white z-50 py-4 px-6 shadow-lg animate-in slide-in-from-top duration-300`}
    >
      <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-2">
        <div className="text-xs font-semibold opacity-75 uppercase tracking-wider">
          {currentItem.label}
        </div>
        <div className="text-xl font-bold animate-in fade-in duration-200 text-center">
          {currentItem.value}
        </div>
      </div>
    </div>
  );
}
