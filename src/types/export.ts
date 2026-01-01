export type ExportFormat = 'csv' | 'json' | 'clipboard' | 'permalink';

export interface ExportConfig {
  format: ExportFormat;
  includeAudioUrl: boolean;
  includeTranscript: boolean;
}
