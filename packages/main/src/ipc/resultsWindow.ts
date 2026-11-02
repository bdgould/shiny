import { ipcMain } from 'electron'
import { getResultsWindowManager } from '../resultsWindow.js'
import { isAuthorizedSender } from './security.js'

/**
 * IPC for the popped-out results window. The main process only relays:
 * the main window publishes snapshots, the results window asks for one when
 * it loads and forwards execute requests, and each side may close the window.
 *
 * Every handler checks the sender is our renderer; the relay handlers also
 * check which of our two windows sent them, so the results window cannot
 * publish state and the main window cannot impersonate the results window.
 */

function manager() {
  return getResultsWindowManager()
}

ipcMain.handle('resultsWindow:open', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  const m = manager()
  if (!m) return false
  m.open()
  return true
})

ipcMain.handle('resultsWindow:close', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  manager()?.close()
})

ipcMain.handle('resultsWindow:isOpen', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  return manager()?.isOpen() ?? false
})

/** Main window -> results window: a snapshot of the active tab's results. */
ipcMain.handle('resultsWindow:publish', async (event, state: unknown) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  const m = manager()
  if (!m || !m.isMainSender(event.sender.id)) return false
  return m.sendToResults('resultsWindow:state', state)
})

/** Results window -> main window: loaded, please publish the current state. */
ipcMain.handle('resultsWindow:ready', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  const m = manager()
  if (!m || !m.isResultsSender(event.sender.id)) return false
  return m.sendToMain('resultsWindow:ready')
})

/** Results window -> main window: run the active query. */
ipcMain.handle('resultsWindow:execute', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender')
  }
  const m = manager()
  if (!m || !m.isResultsSender(event.sender.id)) return false
  return m.sendToMain('resultsWindow:execute')
})

console.log('Results window IPC handlers registered')
