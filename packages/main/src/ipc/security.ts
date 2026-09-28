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

  // Compare parsed protocol/origin rather than string prefixes, so lookalikes
  // such as http://localhost:5173@evil.com or http://localhost:51730 fail.
  let parsed: URL
  try {
    parsed = new URL(frame.url)
  } catch {
    return false
  }

  return parsed.protocol === 'file:' || parsed.origin === DEV_SERVER_ORIGIN
}

/**
 * Throws unless the frame that sent an IPC message is our renderer.
 */
export function assertAuthorizedSender(frame: Electron.WebFrameMain | null): void {
  if (!isAuthorizedSender(frame)) {
    throw new Error('Unauthorized IPC sender')
  }
}
