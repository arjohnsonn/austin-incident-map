export interface FireIncident {
  traffic_report_id: string;
  published_date: string;
  issue_reported: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  latitude: string;
  longitude: string;
  address: string;
  traffic_report_status: 'ACTIVE' | 'ARCHIVED';
  traffic_report_status_date_time: string;
  agency: string;
  incidentType: 'fire' | 'medical' | 'traffic' | null;
  units?: string[];
  channels?: string[];
  audioUrl?: string;
  rawTranscript?: string;
  estimatedResolutionMinutes?: number;
}

export type IncidentStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export type DateRange = 'ALL' | 'DYNAMIC' | 'LAST_30_MINS' | 'LAST_HOUR' | 'LAST_4_HOURS' | 'LAST_12_HOURS' | 'TODAY' | 'WEEK' | 'CUSTOM';

export interface FilterState {
  search: string;
  status: IncidentStatus;
  dateRange: DateRange;
  startDate: Date | undefined;
  endDate: Date | undefined;
  startTime?: string;
  endTime?: string;
  agency: string;
  units: string[];
  showOnlyStaging: boolean;
}