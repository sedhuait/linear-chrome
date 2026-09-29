export interface NetworkLogEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}
