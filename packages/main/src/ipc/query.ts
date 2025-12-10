import { ipcMain } from 'electron'
import { getBackendService } from '../services/index.js'
import { BackendFactory } from '../backends/BackendFactory.js'

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url
  return url.startsWith('file://') || url.startsWith('http://localhost:5173')
}

// Execute SPARQL query
ipcMain.handle('query:execute', async (event, { query, backendId }) => {
  // 1. Validate sender
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }

  // 2. Validate input
  if (typeof query !== 'string') {
    throw new Error('Invalid query parameter')
  }

  if (typeof backendId !== 'string' || !backendId) {
    throw new Error('Invalid backend ID')
  }

  if (query.length > 100000) {
    throw new Error('Query too large (max 100KB)')
  }

  try {
    // 3. Get backend service
    const backendService = getBackendService()

    // 4. Load backend config
    const config = await backendService.getBackend(backendId)
    if (!config) {
      throw new Error(`Backend not found: ${backendId}`)
    }

    console.log('[Query] Executing query against backend:', {
      id: config.id,
      name: config.name,
      type: config.type,
      endpoint: config.endpoint,
      providerConfig: config.providerConfig,
    })

    // 5. Load credentials (if any)
    const credentials = await backendService.getCredentials(backendId)

    // 6. Get provider for backend type
    const provider = BackendFactory.getProvider(config.type)

    // 7. Execute query via provider
    const result = await provider.execute(config, query, credentials || undefined)

    // Return structured response
    return result
  } catch (error: unknown) {
    console.error('[Query] Query execution error:', error)
    if (error instanceof Error) {
      throw new Error(`Query execution failed: ${error.message}`)
    }
    throw new Error('Query execution failed: Unknown error')
  }
})
