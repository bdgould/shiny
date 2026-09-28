/**
 * Shared IPC sender validation.
 *
 * Every ipcMain handler must confirm the message originated from our own
 * renderer - either the packaged file:// bundle or the Vite dev server - before
 * acting on it. Keeping this in one place means a handler cannot silently ship
 * with a weaker check than the rest.
 */

const DEV_SERVER_ORIGIN = 'http://localhost:5173'

/**
 * Returns true when the frame that sent an IPC message is our renderer.
 */
export function isAuthorizedSender(frame: Electron.WebFrameMain | null): boolean {
  if (!frame) {
    return false
  }

  const url = frame.url
  return url.startsWith('file://') || url.startsWith(DEV_SERVER_ORIGIN)
}

/**
 * Throws unless the frame that sent an IPC message is our renderer.
 */
export function assertAuthorizedSender(frame: Electron.WebFrameMain | null): void {
  if (!isAuthorizedSender(frame)) {
    throw new Error('Unauthorized IPC sender')
  }
}
