/**
 * IPC handlers for Mobi-specific operations
 */

import { ipcMain } from 'electron'
import axios from 'axios'
import type {
  MobiCatalog,
  MobiRecord,
  MobiBranch,
  MobiRepository,
  MobiAuthResponse,
} from '../backends/providers/mobi-types.js'

// Lazy-loaded ESM modules
let wrapperModule: any = null
let CookieJarClass: any = null

// Initialize ESM modules using dynamic import
async function initEsmModules() {
  if (!wrapperModule) {
    // Use eval to prevent TypeScript from converting dynamic import to require
    const dynamicImport = new Function('specifier', 'return import(specifier)')

    const cookiejarSupport = await dynamicImport('axios-cookiejar-support')
    wrapperModule = cookiejarSupport.wrapper
    const toughCookie = await dynamicImport('tough-cookie')
    CookieJarClass = toughCookie.CookieJar
  }
}

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url
  return url.startsWith('file://') || url.startsWith('http://localhost:5173')
}

/**
 * Create axios instance with SSL configuration and cookie jar support
 */
async function createAxiosInstance(allowInsecure: boolean = false) {
  // Initialize ESM modules if needed
  await initEsmModules()

  const jar = new CookieJarClass()

  // Note: axios-cookiejar-support doesn't support custom httpsAgent
  // If allowInsecure is needed, we'll need to configure it differently
  const axiosConfig: any = {
    timeout: 15000, // 15 second timeout
  }

  // Only add httpsAgent if allowInsecure is true and we're not using cookies
  // For now, we'll handle SSL verification via NODE_TLS_REJECT_UNAUTHORIZED if needed
  if (allowInsecure) {
    // Cookie jar support doesn't work with custom agents
    // We'll need to rely on environment variable for SSL in this case
    console.warn(
      '[Mobi] allowInsecure flag detected - SSL verification may not be disabled with cookie jar support'
    )
  }

  const client = wrapperModule(axios.create(axiosConfig))
  ;(client.defaults as { jar?: any }).jar = jar
  return { client, jar }
}

/**
 * Extract title from JSON-LD object
 */
function extractTitle(obj: any): string {
  // Try different title fields
  const titleProp =
    obj['http://purl.org/dc/terms/title'] ||
    obj['dcterms:title'] ||
    obj.title ||
    obj.label ||
    obj['@id']

  // Handle array format (JSON-LD can have multiple values)
  if (Array.isArray(titleProp)) {
    return titleProp[0]?.['@value'] || titleProp[0] || 'Untitled'
  }

  // Handle object format
  if (typeof titleProp === 'object' && titleProp !== null) {
    return titleProp['@value'] || 'Untitled'
  }

  // Handle string format
  if (typeof titleProp === 'string') {
    return titleProp
  }

  return 'Untitled'
}

/**
 * Extract description from JSON-LD object
 */
function extractDescription(obj: any): string | undefined {
  const descProp =
    obj['http://purl.org/dc/terms/description'] || obj['dcterms:description'] || obj.description

  if (Array.isArray(descProp)) {
    return descProp[0]?.['@value'] || descProp[0]
  }

  if (typeof descProp === 'object' && descProp !== null) {
    return descProp['@value']
  }

  return typeof descProp === 'string' ? descProp : undefined
}

/**
 * Extract modified date from JSON-LD object
 */
function extractModified(obj: any): string | undefined {
  const modProp =
    obj['http://purl.org/dc/terms/modified'] || obj['dcterms:modified'] || obj.modified

  if (Array.isArray(modProp)) {
    return modProp[0]?.['@value'] || modProp[0]
  }

  if (typeof modProp === 'object' && modProp !== null) {
    return modProp['@value']
  }

  return typeof modProp === 'string' ? modProp : undefined
}

/**
 * Extract type from JSON-LD object
 * Prefers specific record types (OntologyRecord, DatasetRecord, etc.) over base Record type
 */
function extractType(obj: any): string {
  const typeProp = obj['@type'] || obj.type || obj['rdf:type']

  if (Array.isArray(typeProp)) {
    console.log('[Mobi] Record has multiple types:', typeProp)

    // Look for specific record types first (OntologyRecord, DatasetRecord, etc.)
    const specificTypes = [
      'http://mobi.com/ontologies/ontology-editor#OntologyRecord',
      'http://mobi.com/ontologies/dataset#DatasetRecord',
      'http://mobi.com/ontologies/delimited#MappingRecord',
      'http://mobi.com/ontologies/shapes-graph-editor#ShapesGraphRecord',
    ]

    // Find the most specific type
    for (const specificType of specificTypes) {
      if (typeProp.includes(specificType)) {
        console.log('[Mobi] Selected specific type:', specificType)
        return specificType
      }
    }

    // If no specific type found, look for versioned record types
    const versionedTypes = [
      'http://mobi.com/ontologies/catalog#VersionedRDFRecord',
      'http://mobi.com/ontologies/catalog#VersionedRecord',
    ]

    for (const versionedType of versionedTypes) {
      if (typeProp.includes(versionedType)) {
        return versionedType
      }
    }

    // Fall back to the last type in the array
    return typeProp[typeProp.length - 1]
  }

  return typeProp || ''
}

/**
 * Authenticate with Mobi and return cookie jar with session
 */
ipcMain.handle(
  'mobi:authenticate',
  async (event, { baseUrl, username, password, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    // Validate input
    if (typeof baseUrl !== 'string' || !baseUrl) {
      throw new Error('Base URL is required')
    }

    if (typeof username !== 'string' || !username) {
      throw new Error('Username is required')
    }

    if (typeof password !== 'string' || !password) {
      throw new Error('Password is required')
    }

    try {
      const { client } = await createAxiosInstance(allowInsecure)

      const response = await client.post(
        `${baseUrl}/mobirest/session`,
        new URLSearchParams({
          username,
          password,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      // Response contains username in plaintext
      const result: MobiAuthResponse = {
        username: response.data || username,
      }

      return result
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status

        if (statusCode === 401) {
          throw new Error('Authentication failed: Invalid username or password')
        }

        const message = error.response?.data?.message || error.message
        throw new Error(`Authentication failed (${statusCode || 'network error'}): ${message}`)
      }

      if (error instanceof Error) {
        throw new Error(`Authentication failed: ${error.message}`)
      }

      throw new Error('Authentication failed: Unknown error')
    }
  }
)

/**
 * List all catalogs from Mobi
 */
ipcMain.handle('mobi:listCatalogs', async (event, { baseUrl, credentials, allowInsecure }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }

  // Validate input
  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Base URL is required')
  }

  try {
    const { client } = await createAxiosInstance(allowInsecure)

    // Authenticate if credentials provided
    if (credentials?.username && credentials?.password) {
      await client.post(
        `${baseUrl}/mobirest/session`,
        new URLSearchParams({
          username: credentials.username,
          password: credentials.password,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )
    }

    // Fetch catalogs (local catalogs only by default)
    const response = await client.get(`${baseUrl}/mobirest/catalogs`, {
      params: {
        type: 'local',
      },
      headers: {
        Accept: 'application/json',
      },
    })

    console.log('[Mobi] Raw catalogs response:', JSON.stringify(response.data, null, 2))

    // Parse JSON-LD response
    const rawCatalogs = Array.isArray(response.data) ? response.data : []
    const catalogs: MobiCatalog[] = rawCatalogs.map((cat: any) => ({
      id: cat['@id'],
      iri: cat['@id'],
      title: extractTitle(cat),
      description: extractDescription(cat),
      type: 'local' as const,
    }))

    console.log('[Mobi] Parsed catalogs:', catalogs.length)

    return catalogs
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status
      const message = error.response?.data?.message || error.message

      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Authentication failed. Please check your credentials.')
      }

      throw new Error(`Failed to fetch catalogs (${statusCode || 'network error'}): ${message}`)
    }

    if (error instanceof Error) {
      throw new Error(`Failed to fetch catalogs: ${error.message}`)
    }

    throw new Error('Failed to fetch catalogs: Unknown error')
  }
})

/**
 * List records in a catalog with optional type filtering
 */
ipcMain.handle(
  'mobi:listRecords',
  async (event, { baseUrl, catalogId, recordTypes, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    // Validate input
    if (typeof baseUrl !== 'string' || !baseUrl) {
      throw new Error('Base URL is required')
    }

    if (typeof catalogId !== 'string' || !catalogId) {
      throw new Error('Catalog ID is required')
    }

    try {
      const { client } = await createAxiosInstance(allowInsecure)

      // Authenticate if credentials provided
      if (credentials?.username && credentials?.password) {
        await client.post(
          `${baseUrl}/mobirest/session`,
          new URLSearchParams({
            username: credentials.username,
            password: credentials.password,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
      }

      // Build query parameters
      const params: any = {
        offset: 0,
        limit: 100,
      }

      // Add type filter if specified
      if (recordTypes && Array.isArray(recordTypes) && recordTypes.length > 0) {
        params.type = recordTypes
      }

      // Fetch records (encode catalogId since it's an IRI)
      const encodedCatalogId = encodeURIComponent(catalogId)
      const response = await client.get(
        `${baseUrl}/mobirest/catalogs/${encodedCatalogId}/records`,
        {
          params,
          headers: {
            Accept: 'application/json',
          },
        }
      )

      console.log(
        `[Mobi] Raw records response (first 500 chars):`,
        JSON.stringify(response.data).substring(0, 500)
      )

      // Parse JSON-LD response
      const rawRecords = Array.isArray(response.data) ? response.data : []
      const records: MobiRecord[] = rawRecords.map((rec: any) => ({
        id: rec['@id'],
        iri: rec['@id'],
        title: extractTitle(rec),
        type: extractType(rec),
        description: extractDescription(rec),
        modified: extractModified(rec),
      }))

      console.log('[Mobi] Parsed records:', records.length)

      return records
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        const message = error.response?.data?.message || error.message

        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication failed. Please check your credentials.')
        }

        if (statusCode === 404) {
          throw new Error('Catalog not found.')
        }

        throw new Error(`Failed to fetch records (${statusCode || 'network error'}): ${message}`)
      }

      if (error instanceof Error) {
        throw new Error(`Failed to fetch records: ${error.message}`)
      }

      throw new Error('Failed to fetch records: Unknown error')
    }
  }
)

/**
 * List branches for a record
 */
ipcMain.handle(
  'mobi:listBranches',
  async (event, { baseUrl, catalogId, recordId, credentials, allowInsecure }) => {
    if (!isAuthorizedSender(event.senderFrame)) {
      throw new Error('Unauthorized IPC sender')
    }

    // Validate input
    if (typeof baseUrl !== 'string' || !baseUrl) {
      throw new Error('Base URL is required')
    }

    if (typeof catalogId !== 'string' || !catalogId) {
      throw new Error('Catalog ID is required')
    }

    if (typeof recordId !== 'string' || !recordId) {
      throw new Error('Record ID is required')
    }

    try {
      const { client } = await createAxiosInstance(allowInsecure)

      // Authenticate if credentials provided
      if (credentials?.username && credentials?.password) {
        await client.post(
          `${baseUrl}/mobirest/session`,
          new URLSearchParams({
            username: credentials.username,
            password: credentials.password,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
      }

      // Fetch branches (encode catalogId and recordId since they're IRIs)
      const encodedCatalogId = encodeURIComponent(catalogId)
      const encodedRecordId = encodeURIComponent(recordId)
      const response = await client.get(
        `${baseUrl}/mobirest/catalogs/${encodedCatalogId}/records/${encodedRecordId}/branches`,
        {
          params: {
            offset: 0,
            limit: 100,
          },
          headers: {
            Accept: 'application/json',
          },
        }
      )

      console.log(
        `[Mobi] Raw branches response (first 500 chars):`,
        JSON.stringify(response.data).substring(0, 500)
      )

      // Parse JSON-LD response
      const rawBranches = Array.isArray(response.data) ? response.data : []
      const branches: MobiBranch[] = rawBranches.map((branch: any) => ({
        id: branch['@id'],
        iri: branch['@id'],
        title: extractTitle(branch),
        createdDate: extractModified(branch),
      }))

      console.log('[Mobi] Parsed branches:', branches.length)

      // Sort branches: MASTER first, then by title
      branches.sort((a, b) => {
        if (a.title === 'MASTER') return -1
        if (b.title === 'MASTER') return 1
        return a.title.localeCompare(b.title)
      })

      return branches
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        const message = error.response?.data?.message || error.message

        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Authentication failed. Please check your credentials.')
        }

        if (statusCode === 404) {
          throw new Error('Record not found or does not have branches.')
        }

        throw new Error(`Failed to fetch branches (${statusCode || 'network error'}): ${message}`)
      }

      if (error instanceof Error) {
        throw new Error(`Failed to fetch branches: ${error.message}`)
      }

      throw new Error('Failed to fetch branches: Unknown error')
    }
  }
)

/**
 * List all repositories from Mobi
 */
ipcMain.handle('mobi:listRepositories', async (event, { baseUrl, credentials, allowInsecure }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }

  // Validate input
  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Base URL is required')
  }

  try {
    const { client } = await createAxiosInstance(allowInsecure)

    // Authenticate if credentials provided
    if (credentials?.username && credentials?.password) {
      await client.post(
        `${baseUrl}/mobirest/session`,
        new URLSearchParams({
          username: credentials.username,
          password: credentials.password,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )
    }

    // Fetch repositories
    const response = await client.get(`${baseUrl}/mobirest/repositories`, {
      headers: {
        Accept: 'application/json',
      },
    })

    console.log('[Mobi] Raw repositories response:', JSON.stringify(response.data, null, 2))

    // Parse plain JSON response (repositories endpoint returns plain objects, not JSON-LD)
    const rawRepos = Array.isArray(response.data) ? response.data : []
    const repositories: MobiRepository[] = rawRepos.map((repo: any) => {
      // Construct full IRI from repository ID
      // Mobi repositories use the pattern: http://mobi.com/repositories/{id}
      const iri = `http://mobi.com/repositories/${repo.id}`

      return {
        id: iri, // Use full IRI as the ID for the SPARQL endpoint
        iri: iri,
        title: repo.title || repo.id,
        description: repo.description,
      }
    })

    console.log('[Mobi] Parsed repositories:', repositories.length)

    return repositories
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status
      const message = error.response?.data?.message || error.message

      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Authentication failed. Please check your credentials.')
      }

      throw new Error(`Failed to fetch repositories (${statusCode || 'network error'}): ${message}`)
    }

    if (error instanceof Error) {
      throw new Error(`Failed to fetch repositories: ${error.message}`)
    }

    throw new Error('Failed to fetch repositories: Unknown error')
  }
})
