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
  incidentType: 'fire' | 'traffic';
}

export type IncidentStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export type DateRange = 'TODAY' | 'LAST_3_DAYS' | 'WEEK' | 'MONTH' | 'CUSTOM';

export interface FilterState {
  search: string;
  status: IncidentStatus;
  dateRange: DateRange;
  startDate: Date | undefined;
  endDate: Date | undefined;
  agency: string;
}