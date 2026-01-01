'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Download, FileJson, FileSpreadsheet, Link, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { FireIncident } from '@/types/incident';
import { toast } from 'sonner';

interface ExportPopoverProps {
  incidents: FireIncident[];
  disabled?: boolean;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSVField(field: string | null | undefined): string {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
}

function exportToCSV(incidents: FireIncident[]): string {
  const headers = [
    'traffic_report_id',
    'published_date',
    'issue_reported',
    'address',
    'latitude',
    'longitude',
    'units',
    'channels',
    'agency',
    'status',
    'incident_type',
    'estimated_resolution_minutes',
    'audio_url',
  ];

  const rows = incidents.map(incident => [
    escapeCSVField(incident.traffic_report_id),
    escapeCSVField(incident.published_date),
    escapeCSVField(incident.issue_reported),
    escapeCSVField(incident.address),
    escapeCSVField(incident.latitude),
    escapeCSVField(incident.longitude),
    escapeCSVField(incident.units?.join(', ')),
    escapeCSVField(incident.channels?.join(', ')),
    escapeCSVField(incident.agency),
    escapeCSVField(incident.traffic_report_status),
    escapeCSVField(incident.incidentType),
    escapeCSVField(incident.estimatedResolutionMinutes?.toString()),
    escapeCSVField(incident.audioUrl),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csvContent;
}

function exportToJSON(incidents: FireIncident[]): string {
  return JSON.stringify(incidents, null, 2);
}

function exportToClipboardFormat(incidents: FireIncident[]): string {
  return incidents
    .map(incident => {
      const date = format(new Date(incident.published_date), 'MM/dd HH:mm');
      const units = incident.units && incident.units.length > 0 ? incident.units.join(', ') : 'None';
      const channels = incident.channels && incident.channels.length > 0 ? incident.channels.join(', ') : 'None';

      return `[${date}] ${incident.issue_reported || 'Unknown'}
Address: ${incident.address || 'Unknown'}
Units: ${units}
Channels: ${channels}
Status: ${incident.traffic_report_status}
---`;
    })
    .join('\n\n');
}

export function ExportPopover({ incidents, disabled = false }: ExportPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleCSVExport = () => {
    if (incidents.length === 0) {
      toast.error('No incidents to export');
      return;
    }

    setIsExporting(true);
    try {
      const csvContent = exportToCSV(incidents);
      const filename = `austin-fd-incidents-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
      downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
      toast.success(`Exported ${incidents.length} incidents to CSV`);
      setOpen(false);
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleJSONExport = () => {
    if (incidents.length === 0) {
      toast.error('No incidents to export');
      return;
    }

    setIsExporting(true);
    try {
      const jsonContent = exportToJSON(incidents);
      const filename = `austin-fd-incidents-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
      downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
      toast.success(`Exported ${incidents.length} incidents to JSON`);
      setOpen(false);
    } catch (error) {
      console.error('JSON export error:', error);
      toast.error('Failed to export JSON');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClipboardExport = async () => {
    if (incidents.length === 0) {
      toast.error('No incidents to export');
      return;
    }

    setIsExporting(true);
    try {
      const textContent = exportToClipboardFormat(incidents);
      await navigator.clipboard.writeText(textContent);
      toast.success(`Copied ${incidents.length} incidents to clipboard`);
      setOpen(false);
    } catch (error) {
      console.error('Clipboard export error:', error);
      toast.error('Failed to copy to clipboard. Please check browser permissions.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePermalinkExport = async () => {
    if (incidents.length === 0) {
      toast.error('No incidents to create link for');
      return;
    }

    setIsExporting(true);
    try {
      const firstIncident = incidents[0];
      const url = `${window.location.origin}${window.location.pathname}?incident=${firstIncident.traffic_report_id}`;
      await navigator.clipboard.writeText(url);
      toast.success('Shareable link copied to clipboard');
      setOpen(false);
    } catch (error) {
      console.error('Permalink export error:', error);
      toast.error('Failed to copy link to clipboard');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden md:inline">Export</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm mb-1">Export Data</h4>
            <p className="text-xs text-muted-foreground">
              {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleCSVExport}
              disabled={isExporting}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export as CSV
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleJSONExport}
              disabled={isExporting}
            >
              <FileJson className="h-4 w-4" />
              Export as JSON
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={handleClipboardExport}
              disabled={isExporting}
            >
              <Copy className="h-4 w-4" />
              Copy to Clipboard
            </Button>
          </div>

          <Separator />

          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={handlePermalinkExport}
            disabled={isExporting || incidents.length === 0}
          >
            <Link className="h-4 w-4" />
            Share Link (First Incident)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
