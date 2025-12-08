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
  providerConfig?: string;
  allowInsecure?: boolean;
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

export interface GraphmartLayer {
  uri: string;
  name: string;
  type?: string;
}

export interface Graphmart {
  uri: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  description?: string;
  layers: GraphmartLayer[];
}

export interface BackendMetadata {
  id: string;
  name: string;
}

export interface QueryFileData {
  content: string;
  metadata: BackendMetadata | null;
  filePath: string;
}

export interface SaveQueryResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export type OpenQueryResult = QueryFileData | { error: string };

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
    getCredentials: (id: string) => Promise<BackendCredentials | null>;
    getSelected: () => Promise<string | null>;
    setSelected: (id: string | null) => Promise<{ success: boolean }>;
  };
  graphstudio: {
    listGraphmarts: (baseUrl: string, credentials?: { username?: string; password?: string }, allowInsecure?: boolean) => Promise<Graphmart[]>;
    getGraphmartDetails: (baseUrl: string, graphmartUri: string, credentials?: { username?: string; password?: string }, allowInsecure?: boolean) => Promise<Graphmart>;
  };
  files: {
    saveQuery: (query: string, backendMetadata: BackendMetadata | null, currentFilePath?: string) => Promise<SaveQueryResult>;
    openQuery: () => Promise<OpenQueryResult>;
    onFileOpened: (callback: (data: QueryFileData) => void) => () => void;
  };
  menu: {
    onSaveQuery: (callback: () => void) => () => void;
    onOpenQuery: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
