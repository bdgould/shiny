import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of allowed IPC channels
const ALLOWED_CHANNELS = {
  invoke: [
    'query:execute',
    'backends:getAll',
    'backends:create',
    'backends:update',
    'backends:delete',
    'backends:testConnection',
    'backends:getCredentials',
    'backends:getSelected',
    'backends:setSelected',
    'graphstudio:listGraphmarts',
    'graphstudio:getGraphmartDetails',
    'files:saveQuery',
    'files:openQuery',
  ],
  on: ['query:result', 'query:error', 'file:opened', 'menu:saveQuery', 'menu:openQuery'],
};

function validateChannel(channel: string, type: keyof typeof ALLOWED_CHANNELS): boolean {
  return ALLOWED_CHANNELS[type].includes(channel);
}

// Query result structure returned from main process
export interface QueryResult {
  data: any;
  queryType: string;
  contentType?: string;
}

// Backend configuration structure
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

// Backend credentials (for create/update only)
export interface BackendCredentials {
  username?: string;
  password?: string;
  token?: string;
  headers?: Record<string, string>;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// GraphStudio types
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

// File operations types
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

// Define the API that will be exposed to the renderer process
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

// Expose a limited, validated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  query: {
    execute: (query: string, backendId: string) => {
      if (!validateChannel('query:execute', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('query:execute', { query, backendId });
    },
  },
  backends: {
    getAll: () => {
      if (!validateChannel('backends:getAll', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:getAll');
    },
    create: (config: Partial<BackendConfig>, credentials?: BackendCredentials) => {
      if (!validateChannel('backends:create', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:create', { config, credentials });
    },
    update: (id: string, updates: Partial<BackendConfig>, credentials?: BackendCredentials) => {
      if (!validateChannel('backends:update', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:update', { id, updates, credentials });
    },
    delete: (id: string) => {
      if (!validateChannel('backends:delete', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:delete', { id });
    },
    testConnection: (id: string) => {
      if (!validateChannel('backends:testConnection', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:testConnection', { id });
    },
    getCredentials: (id: string) => {
      if (!validateChannel('backends:getCredentials', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:getCredentials', { id });
    },
    getSelected: () => {
      if (!validateChannel('backends:getSelected', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:getSelected');
    },
    setSelected: (id: string | null) => {
      if (!validateChannel('backends:setSelected', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('backends:setSelected', { id });
    },
  },
  graphstudio: {
    listGraphmarts: (baseUrl: string, credentials?: { username?: string; password?: string }, allowInsecure?: boolean) => {
      if (!validateChannel('graphstudio:listGraphmarts', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('graphstudio:listGraphmarts', { baseUrl, credentials, allowInsecure });
    },
    getGraphmartDetails: (baseUrl: string, graphmartUri: string, credentials?: { username?: string; password?: string }, allowInsecure?: boolean) => {
      if (!validateChannel('graphstudio:getGraphmartDetails', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('graphstudio:getGraphmartDetails', { baseUrl, graphmartUri, credentials, allowInsecure });
    },
  },
  files: {
    saveQuery: (query: string, backendMetadata: BackendMetadata | null, currentFilePath?: string) => {
      if (!validateChannel('files:saveQuery', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('files:saveQuery', query, backendMetadata, currentFilePath);
    },
    openQuery: () => {
      if (!validateChannel('files:openQuery', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('files:openQuery');
    },
    onFileOpened: (callback: (data: QueryFileData) => void) => {
      if (!validateChannel('file:opened', 'on')) {
        throw new Error('Unauthorized IPC channel');
      }
      const listener = (_event: any, data: QueryFileData) => callback(data);
      ipcRenderer.on('file:opened', listener);
      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('file:opened', listener);
      };
    },
  },
  menu: {
    onSaveQuery: (callback: () => void) => {
      if (!validateChannel('menu:saveQuery', 'on')) {
        throw new Error('Unauthorized IPC channel');
      }
      const listener = () => callback();
      ipcRenderer.on('menu:saveQuery', listener);
      return () => {
        ipcRenderer.removeListener('menu:saveQuery', listener);
      };
    },
    onOpenQuery: (callback: () => void) => {
      if (!validateChannel('menu:openQuery', 'on')) {
        throw new Error('Unauthorized IPC channel');
      }
      const listener = () => callback();
      ipcRenderer.on('menu:openQuery', listener);
      return () => {
        ipcRenderer.removeListener('menu:openQuery', listener);
      };
    },
  },
} as ElectronAPI);
