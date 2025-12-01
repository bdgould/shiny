export interface QueryResult {
  data: any;
  queryType: string;
  contentType?: string;
}

export interface BackendConfig {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  authType: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackendCredentials {
  username?: string;
  password?: string;
  token?: string;
  headers?: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ElectronAPI {
  query: {
    execute: (query: string, backendId: string) => Promise<QueryResult>;
  };
  backends: {
    getAll: () => Promise<BackendConfig[]>;
    create: (config: Partial<BackendConfig>, credentials?: BackendCredentials) => Promise<BackendConfig>;
    update: (id: string, updates: Partial<BackendConfig>, credentials?: BackendCredentials) => Promise<BackendConfig>;
    delete: (id: string) => Promise<{ success: boolean }>;
    testConnection: (id: string) => Promise<ValidationResult>;
    getSelected: () => Promise<string | null>;
    setSelected: (id: string | null) => Promise<{ success: boolean }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
