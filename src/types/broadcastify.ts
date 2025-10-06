export interface BroadcastifyCall {
  groupId: string;
  ts: number;
  nodeId: number;
  type: number;
  start_ts: number;
  end_ts: number;
  duration: number;
  skew: number;
  descr?: string;
  display?: string;
  grouping?: string;
  tag?: number;
  sid?: number;
  siteId?: number;
  freq?: number;
  src?: number;
  url: string;
}

export interface BroadcastifyLiveResponse {
  start?: number;
  end?: number;
  serverTime: number;
  lastPos: number;
  calls: BroadcastifyCall[];
}

export interface ParsedDispatchCall {
  callType: string | null;
  units: string[];
  channels: string[];
  address: string | null;
  estimatedResolutionMinutes: number;
  rawTranscript: string;
  incidentType: 'fire' | 'medical';
}

export interface DispatchIncident {
  id: string;
  callType: string;
  units: string[];
  channels: string[];
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  timestamp: Date;
  audioUrl: string;
  rawTranscript: string;
  groupId: string;
  duration: number;
  estimatedResolutionMinutes: number;
  incidentType: 'fire' | 'medical';
}
