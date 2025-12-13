export interface QueryResult {
  data: any
  queryType: string
  contentType?: string
}

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

export interface BackendCredentials {
  username?: string
  password?: string
  token?: string
  headers?: Record<string, string>
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface GraphmartLayer {
  uri: string
  name: string
  type?: string
  enabled: boolean
}

export interface Graphmart {
  uri: string
  name: string
  status: 'active' | 'inactive' | 'error'
  description?: string
  layers: GraphmartLayer[]
}

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

export interface MobiAuthResponse {
  username: string
}

export interface MobiRepository {
  id: string
  iri: string
  title: string
  description?: string
}

export interface GraphDBRepository {
  id: string
  title: string
  uri: string
  readable: boolean
  writable: boolean
  type: string
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
  filePath?: string
  error?: string
}

export type OpenQueryResult = QueryFileData | { error: string }

export interface SaveResultsResult {
  success: boolean
  filePath?: string
  error?: string
}

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
    saveResults: (content: string, queryType: string, format: string) => Promise<SaveResultsResult>
  }
  menu: {
    onSaveQuery: (callback: () => void) => () => void
    onOpenQuery: (callback: () => void) => () => void
    onSaveResults: (callback: () => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
