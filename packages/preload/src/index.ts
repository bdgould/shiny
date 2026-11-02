import { contextBridge, ipcRenderer } from 'electron'

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
    'mobi:authenticate',
    'mobi:listCatalogs',
    'mobi:listRepositories',
    'mobi:listRecords',
    'mobi:listBranches',
    'graphdb:authenticate',
    'graphdb:getServerInfo',
    'graphdb:listRepositories',
    'graphdb:getRepositoryDetails',
    'graphdb:testConnection',
    'files:saveQuery',
    'files:openQuery',
    'files:saveResults',
    'files:openPrefixFile',
    'files:showInFolder',
    'cache:fetch',
    'cache:testQuery',
    'resultsWindow:open',
    'resultsWindow:close',
    'resultsWindow:isOpen',
    'resultsWindow:publish',
    'resultsWindow:ready',
    'resultsWindow:execute',
  ],
  on: [
    'query:result',
    'query:error',
    'file:opened',
    'menu:newQuery',
    'menu:saveQuery',
    'menu:openQuery',
    'menu:saveResults',
    'menu:formatQuery',
    'menu:toggleResultsWindow',
    'cache:progress',
    'resultsWindow:state',
    'resultsWindow:closed',
    'resultsWindow:ready',
    'resultsWindow:execute',
  ],
}

function validateChannel(channel: string, type: keyof typeof ALLOWED_CHANNELS): boolean {
  return ALLOWED_CHANNELS[type].includes(channel)
}

/** invoke() guarded by the channel whitelist. */
function invokeChecked<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!validateChannel(channel, 'invoke')) {
    throw new Error('Unauthorized IPC channel')
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

/** on() guarded by the whitelist; the listener never sees the IPC event. */
function subscribe<T extends unknown[]>(
  channel: string,
  handler: (...args: T) => void
): () => void {
  if (!validateChannel(channel, 'on')) {
    throw new Error('Unauthorized IPC channel')
  }
  const listener = (_event: unknown, ...args: unknown[]) => handler(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// Query result structure returned from main process
export interface QueryResult {
  data: any
  queryType: string
  contentType?: string
}

// Backend configuration structure
export interface BackendConfig {
  id: string
  name: string
  type: string
  endpoint: string
  authType: string
  createdAt: number
  updatedAt: number
  providerConfig?: string
  allowInsecure?: boolean
}

// Backend credentials (for create/update only)
export interface BackendCredentials {
  username?: string
  password?: string
  token?: string
  headers?: Record<string, string>
}

// Validation result
export interface ValidationResult {
  valid: boolean
  error?: string
}

// GraphStudio types
export interface GraphmartLayer {
  uri: string
  name: string
  type?: string
}

export interface Graphmart {
  uri: string
  name: string
  status: 'active' | 'inactive' | 'error'
  description?: string
  layers: GraphmartLayer[]
}

// Mobi types
export interface MobiCatalog {
  id: string
  iri: string
  title: string
  description?: string
  type?: 'local' | 'distributed'
}

export interface MobiRecord {
  id: string
  iri: string
  title: string
  type: string
  description?: string
  modified?: string
  keywords?: string[]
}

export interface MobiBranch {
  id: string
  iri: string
  title: string
  createdDate?: string
}

export interface MobiRepository {
  id: string
  iri: string
  title: string
  description?: string
}

export interface MobiAuthResponse {
  username: string
}

// GraphDB types
export interface GraphDBRepository {
  id: string
  title: string
  uri: string
  state: 'active' | 'inactive' | 'initializing' | 'error'
  readable: boolean
  writable: boolean
  type?: string
  sesameType?: string
  location?: string
  externalUrl?: string
}

export interface GraphDBNamespace {
  prefix: string
  namespace: string
}

export interface GraphDBServerInfo {
  productName: string
  productVersion: string
  versionFamily: '9.x' | '10.x' | '11.x' | 'unknown'
  sesameVersion?: string
}

export interface GraphDBAuthResponse {
  success: boolean
  token?: string
  username?: string
}

export interface GraphDBRepositoryDetails {
  repositoryId: string
  namespaces: GraphDBNamespace[]
  tripleCount?: number
}

export interface GraphDBConnectionResult {
  success: boolean
  message: string
}

// File operations types
export interface BackendMetadata {
  id: string
  name: string
}

export interface QueryFileData {
  content: string
  metadata: BackendMetadata | null
  filePath: string
}

export interface SaveQueryResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export type OpenQueryResult = QueryFileData | { error: string }

/**
 * Snapshot of the active tab the main window publishes to the popped-out
 * results window. `results` is the raw QueryResult; the window renders it
 * exactly as the in-pane view would.
 */
export interface ResultsWindowState {
  tabName: string
  queryType: string | null
  results: QueryResult | null
  error: string | null
  isExecuting: boolean
}

export interface SaveResultsResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export type OpenPrefixFileResult = { content: string } | { error: string }

// Ontology cache types
export interface CacheProgress {
  status: 'idle' | 'loading' | 'refreshing' | 'error' | 'success'
  currentType?: 'class' | 'property' | 'individual'
  fetchedCount: number
  totalCount?: number
  error?: string
}

export interface TestQueryResult {
  valid: boolean
  error?: string
  resultCount?: number
}

// Define the API that will be exposed to the renderer process
export interface ElectronAPI {
  query: {
    execute: (query: string, backendId: string) => Promise<QueryResult>
  }
  backends: {
    getAll: () => Promise<BackendConfig[]>
    create: (
      config: Partial<BackendConfig>,
      credentials?: BackendCredentials
    ) => Promise<BackendConfig>
    update: (
      id: string,
      updates: Partial<BackendConfig>,
      credentials?: BackendCredentials
    ) => Promise<BackendConfig>
    delete: (id: string) => Promise<{ success: boolean }>
    testConnection: (id: string) => Promise<ValidationResult>
    getCredentials: (id: string) => Promise<BackendCredentials | null>
    getSelected: () => Promise<string | null>
    setSelected: (id: string | null) => Promise<{ success: boolean }>
  }
  graphstudio: {
    listGraphmarts: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<Graphmart[]>
    getGraphmartDetails: (
      baseUrl: string,
      graphmartUri: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<Graphmart>
  }
  mobi: {
    authenticate: (
      baseUrl: string,
      username: string,
      password: string,
      allowInsecure?: boolean
    ) => Promise<MobiAuthResponse>
    listCatalogs: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<MobiCatalog[]>
    listRepositories: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<MobiRepository[]>
    listRecords: (
      baseUrl: string,
      catalogId: string,
      recordTypes?: string[],
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<MobiRecord[]>
    listBranches: (
      baseUrl: string,
      catalogId: string,
      recordId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<MobiBranch[]>
  }
  graphdb: {
    authenticate: (
      baseUrl: string,
      username: string,
      password: string,
      allowInsecure?: boolean
    ) => Promise<GraphDBAuthResponse>
    getServerInfo: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<GraphDBServerInfo>
    listRepositories: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<GraphDBRepository[]>
    getRepositoryDetails: (
      baseUrl: string,
      repositoryId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<GraphDBRepositoryDetails>
    testConnection: (
      baseUrl: string,
      repositoryId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => Promise<GraphDBConnectionResult>
  }
  files: {
    saveQuery: (
      query: string,
      backendMetadata: BackendMetadata | null,
      currentFilePath?: string
    ) => Promise<SaveQueryResult>
    openQuery: () => Promise<OpenQueryResult>
    onFileOpened: (callback: (data: QueryFileData) => void) => () => void
    saveResults: (
      content: string,
      queryType: string,
      format: string,
      baseName?: string
    ) => Promise<SaveResultsResult>
    openPrefixFile: () => Promise<OpenPrefixFileResult>
    showInFolder: (filePath: string) => Promise<void>
  }
  menu: {
    onNewQuery: (callback: () => void) => () => void
    onSaveQuery: (callback: () => void) => () => void
    onOpenQuery: (callback: () => void) => () => void
    onSaveResults: (callback: () => void) => () => void
    onFormatQuery: (callback: () => void) => () => void
    onToggleResultsWindow: (callback: () => void) => () => void
  }
  resultsWindow: {
    open: () => Promise<boolean>
    close: () => Promise<void>
    isOpen: () => Promise<boolean>
    publish: (state: ResultsWindowState) => Promise<boolean>
    ready: () => Promise<boolean>
    execute: () => Promise<boolean>
    onState: (callback: (state: ResultsWindowState) => void) => () => void
    onClosed: (callback: () => void) => () => void
    onReady: (callback: () => void) => () => void
    onExecute: (callback: () => void) => () => void
  }
  cache: {
    fetch: (backendId: string, onProgress?: boolean) => Promise<any>
    testQuery: (backendId: string, query: string) => Promise<TestQueryResult>
    onProgress: (
      callback: (data: { backendId: string; progress: CacheProgress }) => void
    ) => () => void
  }
}

// Expose a limited, validated API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  query: {
    execute: (query: string, backendId: string) => {
      if (!validateChannel('query:execute', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('query:execute', { query, backendId })
    },
  },
  backends: {
    getAll: () => {
      if (!validateChannel('backends:getAll', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:getAll')
    },
    create: (config: Partial<BackendConfig>, credentials?: BackendCredentials) => {
      if (!validateChannel('backends:create', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:create', { config, credentials })
    },
    update: (id: string, updates: Partial<BackendConfig>, credentials?: BackendCredentials) => {
      if (!validateChannel('backends:update', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:update', { id, updates, credentials })
    },
    delete: (id: string) => {
      if (!validateChannel('backends:delete', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:delete', { id })
    },
    testConnection: (id: string) => {
      if (!validateChannel('backends:testConnection', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:testConnection', { id })
    },
    getCredentials: (id: string) => {
      if (!validateChannel('backends:getCredentials', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:getCredentials', { id })
    },
    getSelected: () => {
      if (!validateChannel('backends:getSelected', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:getSelected')
    },
    setSelected: (id: string | null) => {
      if (!validateChannel('backends:setSelected', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('backends:setSelected', { id })
    },
  },
  graphstudio: {
    listGraphmarts: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphstudio:listGraphmarts', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphstudio:listGraphmarts', {
        baseUrl,
        credentials,
        allowInsecure,
      })
    },
    getGraphmartDetails: (
      baseUrl: string,
      graphmartUri: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphstudio:getGraphmartDetails', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphstudio:getGraphmartDetails', {
        baseUrl,
        graphmartUri,
        credentials,
        allowInsecure,
      })
    },
  },
  mobi: {
    authenticate: (
      baseUrl: string,
      username: string,
      password: string,
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('mobi:authenticate', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('mobi:authenticate', {
        baseUrl,
        username,
        password,
        allowInsecure,
      })
    },
    listCatalogs: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('mobi:listCatalogs', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('mobi:listCatalogs', {
        baseUrl,
        credentials,
        allowInsecure,
      })
    },
    listRepositories: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('mobi:listRepositories', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('mobi:listRepositories', {
        baseUrl,
        credentials,
        allowInsecure,
      })
    },
    listRecords: (
      baseUrl: string,
      catalogId: string,
      recordTypes?: string[],
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('mobi:listRecords', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('mobi:listRecords', {
        baseUrl,
        catalogId,
        recordTypes,
        credentials,
        allowInsecure,
      })
    },
    listBranches: (
      baseUrl: string,
      catalogId: string,
      recordId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('mobi:listBranches', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('mobi:listBranches', {
        baseUrl,
        catalogId,
        recordId,
        credentials,
        allowInsecure,
      })
    },
  },
  graphdb: {
    authenticate: (
      baseUrl: string,
      username: string,
      password: string,
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphdb:authenticate', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphdb:authenticate', {
        baseUrl,
        username,
        password,
        allowInsecure,
      })
    },
    getServerInfo: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphdb:getServerInfo', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphdb:getServerInfo', {
        baseUrl,
        credentials,
        allowInsecure,
      })
    },
    listRepositories: (
      baseUrl: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphdb:listRepositories', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphdb:listRepositories', {
        baseUrl,
        credentials,
        allowInsecure,
      })
    },
    getRepositoryDetails: (
      baseUrl: string,
      repositoryId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphdb:getRepositoryDetails', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphdb:getRepositoryDetails', {
        baseUrl,
        repositoryId,
        credentials,
        allowInsecure,
      })
    },
    testConnection: (
      baseUrl: string,
      repositoryId: string,
      credentials?: { username?: string; password?: string },
      allowInsecure?: boolean
    ) => {
      if (!validateChannel('graphdb:testConnection', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('graphdb:testConnection', {
        baseUrl,
        repositoryId,
        credentials,
        allowInsecure,
      })
    },
  },
  files: {
    saveQuery: (
      query: string,
      backendMetadata: BackendMetadata | null,
      currentFilePath?: string
    ) => {
      if (!validateChannel('files:saveQuery', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('files:saveQuery', query, backendMetadata, currentFilePath)
    },
    openQuery: () => {
      if (!validateChannel('files:openQuery', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('files:openQuery')
    },
    onFileOpened: (callback: (data: QueryFileData) => void) => {
      if (!validateChannel('file:opened', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = (_event: any, data: QueryFileData) => callback(data)
      ipcRenderer.on('file:opened', listener)
      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('file:opened', listener)
      }
    },
    saveResults: (content: string, queryType: string, format: string, baseName?: string) => {
      if (!validateChannel('files:saveResults', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('files:saveResults', content, queryType, format, baseName)
    },
    showInFolder: (filePath: string) => {
      if (!validateChannel('files:showInFolder', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('files:showInFolder', filePath)
    },
    openPrefixFile: () => {
      if (!validateChannel('files:openPrefixFile', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('files:openPrefixFile')
    },
  },
  menu: {
    onNewQuery: (callback: () => void) => {
      if (!validateChannel('menu:newQuery', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:newQuery', listener)
      return () => {
        ipcRenderer.removeListener('menu:newQuery', listener)
      }
    },
    onSaveQuery: (callback: () => void) => {
      if (!validateChannel('menu:saveQuery', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:saveQuery', listener)
      return () => {
        ipcRenderer.removeListener('menu:saveQuery', listener)
      }
    },
    onOpenQuery: (callback: () => void) => {
      if (!validateChannel('menu:openQuery', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:openQuery', listener)
      return () => {
        ipcRenderer.removeListener('menu:openQuery', listener)
      }
    },
    onSaveResults: (callback: () => void) => {
      if (!validateChannel('menu:saveResults', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:saveResults', listener)
      return () => {
        ipcRenderer.removeListener('menu:saveResults', listener)
      }
    },
    onFormatQuery: (callback: () => void) => {
      if (!validateChannel('menu:formatQuery', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:formatQuery', listener)
      return () => {
        ipcRenderer.removeListener('menu:formatQuery', listener)
      }
    },
    onToggleResultsWindow: (callback: () => void) => {
      if (!validateChannel('menu:toggleResultsWindow', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = () => callback()
      ipcRenderer.on('menu:toggleResultsWindow', listener)
      return () => {
        ipcRenderer.removeListener('menu:toggleResultsWindow', listener)
      }
    },
  },
  resultsWindow: {
    open: () => invokeChecked<boolean>('resultsWindow:open'),
    close: () => invokeChecked<void>('resultsWindow:close'),
    isOpen: () => invokeChecked<boolean>('resultsWindow:isOpen'),
    publish: (state: ResultsWindowState) => invokeChecked<boolean>('resultsWindow:publish', state),
    ready: () => invokeChecked<boolean>('resultsWindow:ready'),
    execute: () => invokeChecked<boolean>('resultsWindow:execute'),
    onState: (callback: (state: ResultsWindowState) => void) =>
      subscribe<[ResultsWindowState]>('resultsWindow:state', (state) => callback(state)),
    onClosed: (callback: () => void) => subscribe('resultsWindow:closed', () => callback()),
    onReady: (callback: () => void) => subscribe('resultsWindow:ready', () => callback()),
    onExecute: (callback: () => void) => subscribe('resultsWindow:execute', () => callback()),
  },
  cache: {
    fetch: (backendId: string, onProgress?: boolean) => {
      if (!validateChannel('cache:fetch', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('cache:fetch', { backendId, onProgress })
    },
    testQuery: (backendId: string, query: string) => {
      if (!validateChannel('cache:testQuery', 'invoke')) {
        throw new Error('Unauthorized IPC channel')
      }
      return ipcRenderer.invoke('cache:testQuery', { backendId, query })
    },
    onProgress: (callback: (data: { backendId: string; progress: CacheProgress }) => void) => {
      if (!validateChannel('cache:progress', 'on')) {
        throw new Error('Unauthorized IPC channel')
      }
      const listener = (_event: any, data: { backendId: string; progress: CacheProgress }) =>
        callback(data)
      ipcRenderer.on('cache:progress', listener)
      return () => {
        ipcRenderer.removeListener('cache:progress', listener)
      }
    },
  },
} as ElectronAPI)
