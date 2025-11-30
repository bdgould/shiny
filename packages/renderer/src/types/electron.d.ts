export interface QueryResult {
  data: any;
  queryType: string;
  contentType?: string;
}

export interface ElectronAPI {
  query: {
    execute: (query: string, endpoint: string) => Promise<QueryResult>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
