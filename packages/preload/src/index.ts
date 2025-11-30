import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of allowed IPC channels
const ALLOWED_CHANNELS = {
  invoke: ['query:execute'],
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

// Define the API that will be exposed to the renderer process
export interface ElectronAPI {
  query: {
    execute: (query: string, endpoint: string) => Promise<QueryResult>;
  };
}

// Expose a limited, validated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  query: {
    execute: (query: string, endpoint: string) => {
      if (!validateChannel('query:execute', 'invoke')) {
        throw new Error('Unauthorized IPC channel');
      }
      return ipcRenderer.invoke('query:execute', { query, endpoint });
    },
  },
} as ElectronAPI);
