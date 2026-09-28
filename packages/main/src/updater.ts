/**
 * Auto-update support.
 *
 * Windows (NSIS) and Linux (AppImage) builds download updates in the
 * background and offer to restart. macOS builds are not code-signed, and
 * Squirrel.Mac refuses to install unsigned updates, so on macOS we only check
 * for a newer release and offer to open the download page.
 */
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

export const RELEASES_URL = 'https://github.com/bdgould/shiny/releases/latest'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

type Updater = Pick<
  typeof autoUpdater,
  'on' | 'checkForUpdates' | 'quitAndInstall' | 'autoDownload' | 'autoInstallOnAppQuit'
>

export interface UpdaterDeps {
  updater: Updater
  dialog: Pick<typeof dialog, 'showMessageBox'>
  shell: Pick<typeof shell, 'openExternal'>
  platform: NodeJS.Platform
  isPackaged: boolean
  env: NodeJS.ProcessEnv
  getWindow: () => BrowserWindow | null
  setInterval: (fn: () => void, ms: number) => unknown
}

export interface UpdateController {
  /** Check now and report the result, including "you're up to date". */
  checkManually: () => Promise<void>
}

/** True when this build can download and install updates by itself. */
export function canSelfInstall(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'linux'
}

export function setupAutoUpdates(deps: UpdaterDeps): UpdateController | null {
  // Dev runs and e2e tests must never contact GitHub or replace the app.
  if (!deps.isPackaged || deps.env.SHINY_DISABLE_UPDATES) {
    return null
  }

  const { updater } = deps
  const selfInstall = canSelfInstall(deps.platform)
  updater.autoDownload = selfInstall
  updater.autoInstallOnAppQuit = selfInstall

  let manualCheck = false

  const showBox = (options: Electron.MessageBoxOptions) => {
    const win = deps.getWindow()
    return win ? deps.dialog.showMessageBox(win, options) : deps.dialog.showMessageBox(options)
  }

  updater.on('update-available', async (info: UpdateInfo) => {
    manualCheck = false
    if (selfInstall) return // downloading; we prompt once it is ready

    const { response } = await showBox({
      type: 'info',
      title: 'Update available',
      message: `Shiny ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Download the new version from GitHub.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      await deps.shell.openExternal(RELEASES_URL)
    }
  })

  updater.on('update-downloaded', async (info: UpdateInfo) => {
    const { response } = await showBox({
      type: 'info',
      title: 'Update ready',
      message: `Shiny ${info.version} has been downloaded`,
      detail: 'Restart now to install it, or it will be installed when you quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) {
      updater.quitAndInstall()
    }
  })

  updater.on('update-not-available', async () => {
    if (!manualCheck) return
    manualCheck = false
    await showBox({
      type: 'info',
      title: 'No updates',
      message: `Shiny ${app.getVersion()} is the latest version`,
      buttons: ['OK'],
    })
  })

  updater.on('error', async (error: Error) => {
    console.error('[updater]', error)
    if (!manualCheck) return
    manualCheck = false
    await showBox({
      type: 'error',
      title: 'Update check failed',
      message: 'Could not check for updates',
      detail: error.message,
      buttons: ['OK'],
    })
  })

  const check = () => {
    updater.checkForUpdates().catch((error: unknown) => {
      console.error('[updater] check failed', error)
    })
  }

  check()
  deps.setInterval(check, CHECK_INTERVAL_MS)

  return {
    checkManually: async () => {
      manualCheck = true
      try {
        await updater.checkForUpdates()
      } catch {
        // Reported through the 'error' event above.
      }
    },
  }
}

/** Wire auto-updates with the real Electron modules. */
export function initAutoUpdates(getWindow: () => BrowserWindow | null): UpdateController | null {
  return setupAutoUpdates({
    updater: autoUpdater,
    dialog,
    shell,
    platform: process.platform,
    isPackaged: app.isPackaged,
    env: process.env,
    getWindow,
    setInterval,
  })
}
