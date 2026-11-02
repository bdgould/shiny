/**
 * The popped-out results window.
 *
 * A second BrowserWindow loads the same renderer bundle with a `#results`
 * hash and renders a results-only app. The main window stays the source of
 * truth: it publishes snapshots of the active tab's results over IPC and the
 * main process relays them here (see ipc/resultsWindow.ts). Closing this
 * window by any route ends with one `closed` notification back to the main
 * window, which restores the in-pane results.
 *
 * Dependencies are injected so the manager can be unit tested without a real
 * Electron window; `initResultsWindow` wires the defaults at startup.
 */
import { BrowserWindow, app } from 'electron'
import Store from 'electron-store'
import * as path from 'path'

export const RESULTS_WINDOW_HASH = 'results'
export const DEV_SERVER_URL = 'http://localhost:5173'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

/**
 * Minimal window surface the manager relies on; satisfied by BrowserWindow.
 * `on` is typed loosely because BrowserWindow declares it as a stack of
 * per-event overloads that no single signature matches.
 */
export interface ManagedWindow {
  webContents: { id: number; send: (channel: string, ...args: unknown[]) => void }
  isDestroyed: () => boolean
  focus: () => void
  close: () => void
  getBounds: () => WindowBounds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: any, listener: (...args: any[]) => void) => unknown
  loadURL: (url: string) => Promise<void>
  loadFile: (file: string, options?: Electron.LoadFileOptions) => Promise<void>
}

export interface BoundsStore {
  get: () => WindowBounds | undefined
  set: (bounds: WindowBounds) => void
}

export interface ResultsWindowDeps {
  /** Construct the window; defaults to `new BrowserWindow(options)`. */
  createWindow: (options: Electron.BrowserWindowConstructorOptions) => ManagedWindow
  getMainWindow: () => ManagedWindow | null
  isDev: boolean
  preloadPath: string
  rendererIndexPath: string
  boundsStore: BoundsStore
}

export const DEFAULT_BOUNDS: WindowBounds = { width: 1000, height: 700 }

export class ResultsWindowManager {
  private window: ManagedWindow | null = null

  constructor(private readonly deps: ResultsWindowDeps) {}

  /** Open the window, or focus it if it already exists. */
  open(): ManagedWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus()
      return this.window
    }

    const saved = this.deps.boundsStore.get()
    const window = this.deps.createWindow({
      ...DEFAULT_BOUNDS,
      ...saved,
      minWidth: 500,
      minHeight: 300,
      title: 'Results',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.deps.preloadPath,
      },
    })
    this.window = window

    const saveBounds = () => {
      if (!window.isDestroyed()) this.deps.boundsStore.set(window.getBounds())
    }
    window.on('resize', saveBounds)
    window.on('move', saveBounds)
    window.on('close', saveBounds)
    window.on('closed', () => {
      this.window = null
      const main = this.deps.getMainWindow()
      if (main && !main.isDestroyed()) {
        main.webContents.send('resultsWindow:closed')
      }
    })

    if (this.deps.isDev) {
      void window.loadURL(`${DEV_SERVER_URL}/#${RESULTS_WINDOW_HASH}`)
    } else {
      void window.loadFile(this.deps.rendererIndexPath, { hash: RESULTS_WINDOW_HASH })
    }

    return window
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
  }

  get(): ManagedWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  isOpen(): boolean {
    return this.get() !== null
  }

  /** True when the given webContents id belongs to the results window. */
  isResultsSender(webContentsId: number): boolean {
    return this.get()?.webContents.id === webContentsId
  }

  /** True when the given webContents id belongs to the main window. */
  isMainSender(webContentsId: number): boolean {
    const main = this.deps.getMainWindow()
    return !!main && !main.isDestroyed() && main.webContents.id === webContentsId
  }

  /** Forward a message to the results window, if open. Returns whether it was sent. */
  sendToResults(channel: string, ...args: unknown[]): boolean {
    const target = this.get()
    if (!target) return false
    target.webContents.send(channel, ...args)
    return true
  }

  /** Forward a message to the main window, if present. Returns whether it was sent. */
  sendToMain(channel: string, ...args: unknown[]): boolean {
    const main = this.deps.getMainWindow()
    if (!main || main.isDestroyed()) return false
    main.webContents.send(channel, ...args)
    return true
  }
}

let manager: ResultsWindowManager | null = null

/**
 * Wire the manager with production dependencies. Called once from index.ts
 * after the main window exists.
 */
export function initResultsWindow(getMainWindow: () => BrowserWindow | null): ResultsWindowManager {
  manager = new ResultsWindowManager({
    createWindow: (options) => new BrowserWindow(options),
    getMainWindow,
    isDev: !app.isPackaged,
    preloadPath: path.join(__dirname, '../../preload/dist/index.js'),
    rendererIndexPath: path.join(__dirname, '../../renderer/dist/index.html'),
    boundsStore: createBoundsStore(),
  })
  return manager
}

/** The manager, or null before `initResultsWindow` has run. */
export function getResultsWindowManager(): ResultsWindowManager | null {
  return manager
}

/** Test seam. */
export function setResultsWindowManager(next: ResultsWindowManager | null): void {
  manager = next
}

interface WindowStateSchema {
  resultsWindow?: WindowBounds
}

/**
 * Persist the results window's bounds in their own electron-store so they
 * stay out of the backend/credential config.
 */
function createBoundsStore(): BoundsStore {
  const store = new Store<WindowStateSchema>({ name: 'shiny-window-state' })
  return {
    get: () => store.get('resultsWindow'),
    set: (bounds) => store.set('resultsWindow', bounds),
  }
}
