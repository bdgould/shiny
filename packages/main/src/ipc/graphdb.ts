/**
 * IPC handlers for GraphDB-specific operations
 * Supports GraphDB versions 9.x through 11.x
 */

import { ipcMain } from 'electron'
import axios from 'axios'
import https from 'https'
import type {
  GraphDBRepository,
  GraphDBServerInfo,
  GraphDBNamespace,
  GraphDBVersionFamily,
  GraphDBAuthResponse,
  GraphDBRepositoryDetails,
  GraphDBConnectionResult,
  RepositoryState,
} from '../backends/providers/graphdb-types.js'

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url
  return url.startsWith('file://') || url.startsWith('http://localhost:5173')
}

/**
 * Create axios instance with SSL configuration
 */
function createAxiosInstance(allowInsecure: boolean = false) {
  return axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: !allowInsecure,
    }),
    timeout: 15000,
  })
}

/**
 * Authenticate with GraphDB and return token
 * Tries multiple login endpoints for version compatibility
 */
async function authenticateGraphDB(
  axiosInstance: ReturnType<typeof axios.create>,
  baseUrl: string,
  username: string,
  password: string
): Promise<string> {
  // Try v10+ JSON login first
  try {
    const response = await axiosInstance.post(
      `${baseUrl}/rest/login`,
      { username, password },
      { headers: { 'Content-Type': 'application/json' } }
    )
    const token = response.headers['authorization']
    if (token) {
      console.log('[GraphDB] Authenticated via /rest/login')
      return token
    }
  } catch (error) {
    console.log('[GraphDB] /rest/login failed, trying v9.x endpoint')
  }

  // Try v9.x header-based login
  try {
    const response = await axiosInstance.post(
      `${baseUrl}/rest/login/${encodeURIComponent(username)}`,
      null,
      { headers: { 'X-GraphDB-Password': password } }
    )
    const token = response.headers['authorization']
    if (token) {
      console.log('[GraphDB] Authenticated via /rest/login/{username}')
      return token
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error('Authentication failed: Invalid username or password')
    }
    throw error
  }

  throw new Error('Authentication failed: No token received')
}

/**
 * Get auth headers, trying GDB token first then falling back to Basic
 */
async function getAuthHeaders(
  axiosInstance: ReturnType<typeof axios.create>,
  baseUrl: string,
  credentials?: { username?: string; password?: string }
): Promise<Record<string, string>> {
  if (!credentials?.username || !credentials?.password) {
    return {}
  }

  try {
    const token = await authenticateGraphDB(
      axiosInstance,
      baseUrl,
      credentials.username,
      credentials.password
    )
    return { Authorization: token }
  } catch {
    // Fall back to Basic auth
    console.log('[GraphDB] Falling back to Basic auth')
    const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
      'base64'
    )
    return { Authorization: `Basic ${encoded}` }
  }
}

/**
 * Detect GraphDB version from server info
 */
function detectVersionFamily(version: string): GraphDBVersionFamily {
  if (!version) return 'unknown'

  const major = parseInt(version.split('.')[0], 10)
  if (major >= 11) return '11.x'
  if (major >= 10) return '10.x'
  if (major >= 9) return '9.x'
  return 'unknown'
}

/**
 * Normalize repository state from various API formats
 */
function normalizeRepositoryState(state: string | undefined): RepositoryState {
  if (!state) return 'inactive'
  const lower = state.toLowerCase()
  if (lower === 'active' || lower === 'running' || lower === 'ready') return 'active'
  if (lower === 'initializing' || lower === 'starting') return 'initializing'
  if (lower === 'error' || lower === 'failed') return 'error'
  return 'inactive'
}

/**
 * Test authentication with GraphDB
 */
ipcMain.handle(
  'graphdb:authenticate',
  async (
    event,
    {
      baseUrl,
      username,
      password,
      allowInsecure,
    }: {
      baseUrl: string
      username: string
      password: string
      allowInsecure?: boolean
    }
  ): Promise<GraphDBAuthResponse> => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !username || !password) {
      throw new Error('Base URL, username, and password are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const token = await authenticateGraphDB(axiosInstance, normalizedUrl, username, password)

      return { success: true, token, username }
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Authentication failed: Unknown error')
    }
  }
)

/**
 * Get GraphDB server information
 */
ipcMain.handle(
  'graphdb:getServerInfo',
  async (
    event,
    {
      baseUrl,
      credentials,
      allowInsecure,
    }: {
      baseUrl: string
      credentials?: { username?: string; password?: string }
      allowInsecure?: boolean
    }
  ): Promise<GraphDBServerInfo> => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl) {
      throw new Error('Base URL is required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const authHeaders = await getAuthHeaders(axiosInstance, normalizedUrl, credentials)

      // Try multiple endpoints to get version info
      let productVersion = ''
      let productName = 'GraphDB'

      // Try /rest/info/version endpoint (v10+)
      try {
        const response = await axiosInstance.get(`${normalizedUrl}/rest/info/version`, {
          headers: authHeaders,
        })
        productVersion = response.data?.productVersion || response.data
        if (typeof productVersion === 'object') {
          productVersion = productVersion.productVersion || ''
        }
        console.log('[GraphDB] Got version from /rest/info/version:', productVersion)
      } catch (error) {
        console.log('[GraphDB] /rest/info/version not available')
      }

      // Try /protocol endpoint (RDF4J standard)
      if (!productVersion) {
        try {
          const response = await axiosInstance.get(`${normalizedUrl}/protocol`, {
            headers: authHeaders,
          })
          // This returns the protocol version, not GraphDB version
          console.log('[GraphDB] Protocol version:', response.data)
        } catch {
          // Ignore
        }
      }

      // Try /repositories endpoint to confirm connectivity
      if (!productVersion) {
        try {
          await axiosInstance.get(`${normalizedUrl}/repositories`, {
            headers: {
              Accept: 'application/json',
              ...authHeaders,
            },
          })
          // If we get here, server is reachable
          productName = 'GraphDB (version unknown)'
        } catch {
          // Ignore
        }
      }

      const versionFamily = detectVersionFamily(productVersion)

      const serverInfo: GraphDBServerInfo = {
        productName,
        productVersion,
        versionFamily,
      }

      return serverInfo
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication required to access server information')
        }
        throw new Error(`Failed to get server info (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to get server information')
    }
  }
)

/**
 * List all repositories from GraphDB
 */
ipcMain.handle(
  'graphdb:listRepositories',
  async (
    event,
    {
      baseUrl,
      credentials,
      allowInsecure,
    }: {
      baseUrl: string
      credentials?: { username?: string; password?: string }
      allowInsecure?: boolean
    }
  ): Promise<GraphDBRepository[]> => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl) {
      throw new Error('Base URL is required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const authHeaders = await getAuthHeaders(axiosInstance, normalizedUrl, credentials)

      // Try REST API first (provides more details)
      let repositories: GraphDBRepository[] = []

      try {
        const response = await axiosInstance.get(`${normalizedUrl}/rest/repositories`, {
          headers: {
            Accept: 'application/json',
            ...authHeaders,
          },
        })

        console.log('[GraphDB] Raw REST repositories response:', JSON.stringify(response.data, null, 2))

        // REST API returns detailed repository info
        const data = Array.isArray(response.data) ? response.data : []
        repositories = data.map((repo: Record<string, unknown>) => ({
          id: repo.id as string,
          title: (repo.title as string) || (repo.id as string),
          uri: (repo.uri as string) || `${normalizedUrl}/repositories/${repo.id}`,
          state: normalizeRepositoryState(repo.state as string | undefined),
          readable: repo.readable !== false,
          writable: repo.writable !== false,
          type: repo.type as string | undefined,
          sesameType: repo.sesameType as string | undefined,
          location: repo.location as string | undefined,
          externalUrl: repo.externalUrl as string | undefined,
        }))

        console.log('[GraphDB] Parsed repositories from REST API:', repositories.length)
      } catch (restError) {
        console.log('[GraphDB] REST API failed, trying RDF4J endpoint')

        // Fall back to RDF4J repositories endpoint
        const response = await axiosInstance.get(`${normalizedUrl}/repositories`, {
          headers: {
            Accept: 'application/sparql-results+json',
            ...authHeaders,
          },
        })

        console.log('[GraphDB] Raw RDF4J repositories response:', JSON.stringify(response.data, null, 2))

        // RDF4J endpoint returns SPARQL results format
        const bindings = response.data?.results?.bindings || []
        repositories = bindings.map((binding: Record<string, { value?: string }>) => ({
          id: binding.id?.value || '',
          title: binding.title?.value || binding.id?.value || '',
          uri: binding.uri?.value || `${normalizedUrl}/repositories/${binding.id?.value}`,
          state: 'active' as const,
          readable: binding.readable?.value !== 'false',
          writable: binding.writable?.value !== 'false',
        }))

        console.log('[GraphDB] Parsed repositories from RDF4J API:', repositories.length)
      }

      // Sort: active first, then by title
      repositories.sort((a, b) => {
        if (a.state !== b.state) {
          const stateOrder: Record<RepositoryState, number> = {
            active: 0,
            initializing: 1,
            inactive: 2,
            error: 3,
          }
          return stateOrder[a.state] - stateOrder[b.state]
        }
        return a.title.localeCompare(b.title)
      })

      return repositories
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication failed. Please check your credentials.')
        }
        throw new Error(`Failed to list repositories (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to list repositories')
    }
  }
)

/**
 * Get repository details including namespaces
 */
ipcMain.handle(
  'graphdb:getRepositoryDetails',
  async (
    event,
    {
      baseUrl,
      repositoryId,
      credentials,
      allowInsecure,
    }: {
      baseUrl: string
      repositoryId: string
      credentials?: { username?: string; password?: string }
      allowInsecure?: boolean
    }
  ): Promise<GraphDBRepositoryDetails> => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !repositoryId) {
      throw new Error('Base URL and repository ID are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const authHeaders = await getAuthHeaders(axiosInstance, normalizedUrl, credentials)

      // Fetch namespaces
      let namespaces: GraphDBNamespace[] = []
      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}/namespaces`,
          {
            headers: {
              Accept: 'application/sparql-results+json',
              ...authHeaders,
            },
          }
        )

        const bindings = response.data?.results?.bindings || []
        namespaces = bindings.map((binding: Record<string, { value?: string }>) => ({
          prefix: binding.prefix?.value || '',
          namespace: binding.namespace?.value || '',
        }))

        console.log(`[GraphDB] Fetched ${namespaces.length} namespaces for repository ${repositoryId}`)
      } catch (error) {
        console.warn('[GraphDB] Failed to fetch namespaces:', error)
      }

      // Get repository size (triple count)
      let tripleCount: number | undefined
      try {
        const response = await axiosInstance.get(
          `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}/size`,
          { headers: authHeaders }
        )
        tripleCount = parseInt(response.data, 10)
        if (isNaN(tripleCount)) {
          tripleCount = undefined
        }
        console.log(`[GraphDB] Repository ${repositoryId} contains ${tripleCount} triples`)
      } catch {
        console.log('[GraphDB] Could not fetch repository size')
      }

      return {
        repositoryId,
        namespaces,
        tripleCount,
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        throw new Error(`Failed to get repository details (${statusCode}): ${error.message}`)
      }
      throw new Error('Failed to get repository details')
    }
  }
)

/**
 * Test repository connection with a simple query
 */
ipcMain.handle(
  'graphdb:testConnection',
  async (
    event,
    {
      baseUrl,
      repositoryId,
      credentials,
      allowInsecure,
    }: {
      baseUrl: string
      repositoryId: string
      credentials?: { username?: string; password?: string }
      allowInsecure?: boolean
    }
  ): Promise<GraphDBConnectionResult> => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    if (!baseUrl || !repositoryId) {
      throw new Error('Base URL and repository ID are required')
    }

    try {
      const axiosInstance = createAxiosInstance(allowInsecure)
      const normalizedUrl = baseUrl.replace(/\/+$/, '')

      const authHeaders = await getAuthHeaders(axiosInstance, normalizedUrl, credentials)

      // Simple test query
      const testQuery = 'SELECT * WHERE { ?s ?p ?o } LIMIT 1'

      await axiosInstance.post(
        `${normalizedUrl}/repositories/${encodeURIComponent(repositoryId)}`,
        testQuery,
        {
          headers: {
            'Content-Type': 'application/sparql-query',
            Accept: 'application/sparql-results+json',
            ...authHeaders,
          },
          timeout: 10000,
        }
      )

      return {
        success: true,
        message: `Successfully connected to repository '${repositoryId}'`,
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        if (statusCode === 401 || statusCode === 403) {
          return { success: false, message: 'Authentication failed' }
        }
        if (statusCode === 404) {
          return { success: false, message: 'Repository not found' }
        }
        return { success: false, message: `Connection failed (${statusCode})` }
      }
      return { success: false, message: 'Connection failed' }
    }
  }
)
