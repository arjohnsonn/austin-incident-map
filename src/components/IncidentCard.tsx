"use client";

import { FireIncident } from "@/types/incident";
import { format } from "date-fns";
import { Play, Pause, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getChannelUrl } from "@/lib/channels";

interface IncidentCardProps {
  incident: FireIncident;
  isSelected: boolean;
  isNew: boolean;
  isPlaying: boolean;
  showDownloadButton?: boolean;
  onSelect: (incident: FireIncident) => void;
  onPlayAudio: (e: React.MouseEvent, incident: FireIncident) => void;
  onDownloadAudio?: (e: React.MouseEvent, incident: FireIncident) => void;
}

export function IncidentCard({
  incident,
  isSelected,
  isNew,
  isPlaying,
  showDownloadButton,
  onSelect,
  onPlayAudio,
  onDownloadAudio,
}: IncidentCardProps) {
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MM/dd HH:mm");
    } catch {
      return "Invalid date";
    }
  };

  const hasStagingInstructions = incident.rawTranscript
    ?.toLowerCase()
    .includes("check for possible staging instructions");

  return (
    <Card
      className={`p-4 cursor-pointer transition-colors border ${
        isSelected
          ? "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700"
          : hasStagingInstructions
          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
          : "border-neutral-200 dark:border-neutral-700"
      } ${isNew ? "animate-new-incident" : ""}`}
      onClick={() => onSelect(incident)}
    >
      <div className="flex items-start gap-3">
        {incident.audioUrl && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => onPlayAudio(e, incident)}
              className="min-w-11 min-h-11 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              title="Play dispatch audio"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <Play className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              )}
            </button>
            {showDownloadButton && onDownloadAudio && (
              <button
                onClick={(e) => onDownloadAudio(e, incident)}
                className="min-w-11 min-h-11 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
                title="Download audio"
              >
                <Download className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="font-semibold text-sm truncate">
              {incident.issue_reported}
            </h3>
            <time className="text-xs text-muted-foreground font-mono flex-shrink-0">
              {formatDate(incident.published_date)}
            </time>
          </div>

          <p className="text-sm text-muted-foreground mb-2 truncate">
            {(() => {
              const hasValidCoords =
                incident.location?.coordinates &&
                incident.location.coordinates[0] !== 0 &&
                incident.location.coordinates[1] !== 0;

              if (!incident.location) return "?";
              if (!hasValidCoords) return `${incident.address} (?)`;
              return incident.address;
            })()}
          </p>

          {(incident.units && incident.units.length > 0) ||
          (incident.channels && incident.channels.length > 0) ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {incident.units && incident.units.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Units:</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {incident.units.join(", ")}
                  </span>
                </div>
              )}
              {incident.channels && incident.channels.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Channel:</span>
                  <span className="text-purple-600 dark:text-purple-400">
                    {incident.channels.map((channel, idx) => {
                      const url = getChannelUrl(channel);
                      return (
                        <span key={channel}>
                          {idx > 0 && ", "}
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="underline hover:text-purple-700 dark:hover:text-purple-300"
                            >
                              {channel}
                            </a>
                          ) : (
                            channel
                          )}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
