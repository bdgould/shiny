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
    'backends:getSelected',
    'backends:setSelected',
  ],
  on: ['query:result', 'query:error'],
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
    getSelected: () => Promise<string | null>;
    setSelected: (id: string | null) => Promise<{ success: boolean }>;
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
} as ElectronAPI);
