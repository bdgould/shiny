import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', isPackaged: true },
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
}))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

import { setupAutoUpdates, canSelfInstall, RELEASES_URL, type UpdaterDeps } from '../updater'

type Listener = (...args: any[]) => unknown

function makeDeps(overrides: Partial<UpdaterDeps> = {}) {
  const listeners = new Map<string, Listener>()
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn((event: string, fn: Listener) => {
      listeners.set(event, fn)
      return updater
    }),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    quitAndInstall: vi.fn(),
  }
  const win = { id: 1 }
  const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) }
  const deps = {
    updater,
    dialog,
    shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
    platform: 'win32' as NodeJS.Platform,
    isPackaged: true,
    env: {},
    getWindow: () => win as any,
    setInterval: vi.fn(),
    ...overrides,
  }
  const emit = async (event: string, ...args: unknown[]) => listeners.get(event)?.(...args)
  return { deps: deps as unknown as UpdaterDeps & typeof deps, updater, emit, win, dialog }
}

describe('canSelfInstall', () => {
  it('is true on Windows and Linux, false on macOS', () => {
    expect(canSelfInstall('win32')).toBe(true)
    expect(canSelfInstall('linux')).toBe(true)
    expect(canSelfInstall('darwin')).toBe(false)
  })
})

describe('setupAutoUpdates', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does nothing in unpackaged builds', () => {
    const { deps, updater } = makeDeps({ isPackaged: false })
    expect(setupAutoUpdates(deps)).toBeNull()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('does nothing when SHINY_DISABLE_UPDATES is set', () => {
    const { deps, updater } = makeDeps({ env: { SHINY_DISABLE_UPDATES: '1' } })
    expect(setupAutoUpdates(deps)).toBeNull()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('checks on startup and every six hours', () => {
    const { deps, updater } = makeDeps()
    setupAutoUpdates(deps)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), 6 * 60 * 60 * 1000)
    ;(deps.setInterval as any).mock.calls[0][0]()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('logs instead of throwing when a background check fails', async () => {
    const { deps, updater } = makeDeps()
    updater.checkForUpdates.mockRejectedValue(new Error('offline'))
    setupAutoUpdates(deps)
    await Promise.resolve()
    await Promise.resolve()
    expect(console.error).toHaveBeenCalledWith('[updater] check failed', expect.any(Error))
  })

  describe('on Windows and Linux', () => {
    it.each(['win32', 'linux'] as const)(
      'downloads and installs automatically on %s',
      (platform) => {
        const { deps, updater } = makeDeps({ platform })
        setupAutoUpdates(deps)
        expect(updater.autoDownload).toBe(true)
        expect(updater.autoInstallOnAppQuit).toBe(true)
      }
    )

    it('does not prompt when an update is found, only when it is downloaded', async () => {
      const { deps, emit } = makeDeps()
      setupAutoUpdates(deps)
      await emit('update-available', { version: '2.0.0' })
      expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('restarts to install when the user accepts', async () => {
      const { deps, updater, emit, win } = makeDeps()
      setupAutoUpdates(deps)
      await emit('update-downloaded', { version: '2.0.0' })
      expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
        win,
        expect.objectContaining({ message: 'Shiny 2.0.0 has been downloaded' })
      )
      expect(updater.quitAndInstall).toHaveBeenCalled()
    })

    it('waits for quit when the user picks Later', async () => {
      const { deps, updater, emit, dialog } = makeDeps()
      dialog.showMessageBox.mockResolvedValue({ response: 1 })
      setupAutoUpdates(deps)
      await emit('update-downloaded', { version: '2.0.0' })
      expect(updater.quitAndInstall).not.toHaveBeenCalled()
    })
  })

  describe('on macOS', () => {
    it('does not download or install', () => {
      const { deps, updater } = makeDeps({ platform: 'darwin' })
      setupAutoUpdates(deps)
      expect(updater.autoDownload).toBe(false)
      expect(updater.autoInstallOnAppQuit).toBe(false)
    })

    it('offers the download page when an update is available', async () => {
      const { deps, emit } = makeDeps({ platform: 'darwin' })
      setupAutoUpdates(deps)
      await emit('update-available', { version: '2.0.0' })
      expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          message: 'Shiny 2.0.0 is available',
          buttons: ['Download', 'Later'],
        })
      )
      expect(deps.shell.openExternal).toHaveBeenCalledWith(RELEASES_URL)
    })

    it('does not open the page when the user picks Later', async () => {
      const { deps, emit, dialog } = makeDeps({ platform: 'darwin' })
      dialog.showMessageBox.mockResolvedValue({ response: 1 })
      setupAutoUpdates(deps)
      await emit('update-available', { version: '2.0.0' })
      expect(deps.shell.openExternal).not.toHaveBeenCalled()
    })

    it('shows the dialog without a parent when no window is open', async () => {
      const { deps, emit } = makeDeps({ platform: 'darwin', getWindow: () => null })
      setupAutoUpdates(deps)
      await emit('update-available', { version: '2.0.0' })
      expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Update available' })
      )
    })
  })

  describe('manual checks', () => {
    it('reports when already up to date', async () => {
      const { deps, emit } = makeDeps()
      const controller = setupAutoUpdates(deps)!
      await controller.checkManually()
      await emit('update-not-available')
      expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: 'Shiny 1.0.0 is the latest version' })
      )
    })

    it('stays quiet about "no update" for background checks', async () => {
      const { deps, emit } = makeDeps()
      setupAutoUpdates(deps)
      await emit('update-not-available')
      expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
    })

    it('reports errors from a manual check', async () => {
      const { deps, updater, emit } = makeDeps()
      const controller = setupAutoUpdates(deps)!
      updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
      await controller.checkManually()
      await emit('error', new Error('offline'))
      expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'error', detail: 'offline' })
      )
    })

    it('only logs errors from background checks', async () => {
      const { deps, emit } = makeDeps()
      setupAutoUpdates(deps)
      await emit('error', new Error('offline'))
      expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith('[updater]', expect.any(Error))
    })

    it('clears the manual flag once an update is found', async () => {
      const { deps, emit } = makeDeps()
      const controller = setupAutoUpdates(deps)!
      await controller.checkManually()
      await emit('update-available', { version: '2.0.0' })
      await emit('update-not-available')
      expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
    })
  })
})
