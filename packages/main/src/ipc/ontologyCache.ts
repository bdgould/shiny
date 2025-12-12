/**
 * IPC handlers for ontology cache operations
 */

import { ipcMain } from 'electron'
import { getOntologyCacheService } from '../services/index.js'

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url
  return url.startsWith('file://') || url.startsWith('http://localhost:5173')
}

/**
 * Fetch cache from backend
 * Returns the complete ontology cache for a backend
 */
ipcMain.handle('cache:fetch', async (event, { backendId, onProgress }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }

  // Validate input
  if (typeof backendId !== 'string' || !backendId) {
    throw new Error('Invalid backend ID')
  }

  const cacheService = getOntologyCacheService()

  // Progress callback to send updates to renderer
  const progressCallback = onProgress
    ? (progress: any) => {
        event.sender.send('cache:progress', { backendId, progress })
      }
    : undefined

  const cache = await cacheService.fetchCache(backendId, progressCallback)

  return cache
})

/**
 * Test a custom SPARQL query
 * Used for validating user-edited queries in the settings UI
 */
ipcMain.handle('cache:testQuery', async (event, { backendId, query }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }

  // Validate input
  if (typeof backendId !== 'string' || !backendId) {
    throw new Error('Invalid backend ID')
  }

  if (typeof query !== 'string' || !query) {
    throw new Error('Invalid query')
  }

  const cacheService = getOntologyCacheService()
  const result = await cacheService.testQuery(backendId, query)

  return result
})
