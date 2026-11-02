import { describe, it, expect, vi, beforeEach } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  BrowserWindow: vi.fn(),
  app: { isPackaged: true },
  storeData: new Map<string, unknown>(),
  Store: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
  app: electronMocks.app,
}))
vi.mock('electron-store', () => ({ default: electronMocks.Store }))

import {
  ResultsWindowManager,
  DEFAULT_BOUNDS,
  DEV_SERVER_URL,
  RESULTS_WINDOW_HASH,
  getResultsWindowManager,
  initResultsWindow,
  setResultsWindowManager,
  type ManagedWindow,
  type ResultsWindowDeps,
} from '../resultsWindow'

type Listener = (...args: unknown[]) => void

function fakeWindow(id: number) {
  const listeners = new Map<string, Listener[]>()
  let destroyed = false
  const win = {
    webContents: { id, send: vi.fn() },
    isDestroyed: () => destroyed,
    focus: vi.fn(),
    close: vi.fn(() => {
      destroyed = true
      for (const fn of listeners.get('closed') ?? []) fn()
    }),
    getBounds: vi.fn(() => ({ x: 10, y: 20, width: 800, height: 600 })),
    on: vi.fn((event: string, fn: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
      return win
    }),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    emit: (event: string, ...args: unknown[]) => {
      for (const fn of listeners.get(event) ?? []) fn(...args)
    },
    destroy: () => {
      destroyed = true
    },
  }
  return win
}

function makeDeps(overrides: Partial<ResultsWindowDeps> = {}) {
  const main = fakeWindow(1)
  const created: ReturnType<typeof fakeWindow>[] = []
  const boundsStore = { get: vi.fn(() => undefined as any), set: vi.fn() }
  const deps: ResultsWindowDeps = {
    createWindow: vi.fn(() => {
      const w = fakeWindow(100 + created.length)
      created.push(w)
      return w as unknown as ManagedWindow
    }),
    getMainWindow: () => main as unknown as ManagedWindow,
    isDev: false,
    preloadPath: '/app/preload.js',
    rendererIndexPath: '/app/index.html',
    boundsStore,
    ...overrides,
  }
  return { deps, main, created, boundsStore }
}

describe('ResultsWindowManager', () => {
  beforeEach(() => {
    setResultsWindowManager(null)
  })

  it('creates a sandboxed window with default bounds and loads the results hash', () => {
    const { deps, created } = makeDeps()
    const m = new ResultsWindowManager(deps)
    expect(m.isOpen()).toBe(false)

    const win = m.open()
    expect(created).toHaveLength(1)
    expect(win).toBe(created[0])
    expect(deps.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        ...DEFAULT_BOUNDS,
        title: 'Results',
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: '/app/preload.js',
        }),
      })
    )
    expect(created[0].loadFile).toHaveBeenCalledWith('/app/index.html', {
      hash: RESULTS_WINDOW_HASH,
    })
    expect(created[0].loadURL).not.toHaveBeenCalled()
    expect(m.isOpen()).toBe(true)
    expect(m.get()).toBe(created[0])
  })

  it('loads from the dev server in development', () => {
    const { deps, created } = makeDeps({ isDev: true })
    new ResultsWindowManager(deps).open()
    expect(created[0].loadURL).toHaveBeenCalledWith(`${DEV_SERVER_URL}/#${RESULTS_WINDOW_HASH}`)
    expect(created[0].loadFile).not.toHaveBeenCalled()
  })

  it('restores saved bounds over the defaults', () => {
    const { deps, boundsStore } = makeDeps()
    boundsStore.get.mockReturnValue({ x: 5, y: 6, width: 640, height: 480 })
    new ResultsWindowManager(deps).open()
    expect(deps.createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ x: 5, y: 6, width: 640, height: 480 })
    )
  })

  it('focuses the existing window instead of opening a second one', () => {
    const { deps, created } = makeDeps()
    const m = new ResultsWindowManager(deps)
    const first = m.open()
    const again = m.open()
    expect(again).toBe(first)
    expect(created).toHaveLength(1)
    expect(created[0].focus).toHaveBeenCalledTimes(1)
  })

  it('saves bounds on resize, move and close', () => {
    const { deps, created, boundsStore } = makeDeps()
    new ResultsWindowManager(deps).open()
    const win = created[0]
    win.emit('resize')
    win.emit('move')
    win.emit('close')
    expect(boundsStore.set).toHaveBeenCalledTimes(3)
    expect(boundsStore.set).toHaveBeenLastCalledWith({ x: 10, y: 20, width: 800, height: 600 })
    win.destroy()
    win.emit('resize')
    expect(boundsStore.set).toHaveBeenCalledTimes(3)
  })

  it('notifies the main window when the results window closes, then forgets it', () => {
    const { deps, created, main } = makeDeps()
    const m = new ResultsWindowManager(deps)
    m.open()
    m.close()
    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(main.webContents.send).toHaveBeenCalledWith('resultsWindow:closed')
    expect(m.isOpen()).toBe(false)
    expect(m.get()).toBeNull()
    // Closing again is a no-op
    m.close()
    expect(created[0].close).toHaveBeenCalledTimes(1)
  })

  it('survives the main window being gone when the results window closes', () => {
    const { deps, main } = makeDeps()
    main.destroy()
    const m = new ResultsWindowManager(deps)
    m.open()
    expect(() => m.close()).not.toThrow()
    expect(main.webContents.send).not.toHaveBeenCalled()

    const noMain = new ResultsWindowManager({ ...deps, getMainWindow: () => null })
    noMain.open()
    expect(() => noMain.close()).not.toThrow()
  })

  it('identifies which window a webContents id belongs to', () => {
    const { deps, created, main } = makeDeps()
    const m = new ResultsWindowManager(deps)
    expect(m.isResultsSender(100)).toBe(false)
    expect(m.isMainSender(1)).toBe(true)
    m.open()
    expect(m.isResultsSender(created[0].webContents.id)).toBe(true)
    expect(m.isResultsSender(1)).toBe(false)
    expect(m.isMainSender(created[0].webContents.id)).toBe(false)
    main.destroy()
    expect(m.isMainSender(1)).toBe(false)
  })

  it('relays messages to whichever window exists', () => {
    const { deps, created, main } = makeDeps()
    const m = new ResultsWindowManager(deps)
    expect(m.sendToResults('resultsWindow:state', { a: 1 })).toBe(false)
    m.open()
    expect(m.sendToResults('resultsWindow:state', { a: 1 })).toBe(true)
    expect(created[0].webContents.send).toHaveBeenCalledWith('resultsWindow:state', { a: 1 })

    expect(m.sendToMain('resultsWindow:ready')).toBe(true)
    expect(main.webContents.send).toHaveBeenCalledWith('resultsWindow:ready')
    main.destroy()
    expect(m.sendToMain('resultsWindow:ready')).toBe(false)
  })

  it('exposes the module-level manager through the test seam', () => {
    expect(getResultsWindowManager()).toBeNull()
    const m = new ResultsWindowManager(makeDeps().deps)
    setResultsWindowManager(m)
    expect(getResultsWindowManager()).toBe(m)
  })

  describe('initResultsWindow', () => {
    beforeEach(() => {
      electronMocks.storeData.clear()
      electronMocks.Store.mockReset()
      electronMocks.Store.mockImplementation(function (this: any) {
        this.get = (key: string) => electronMocks.storeData.get(key)
        this.set = (key: string, value: unknown) => electronMocks.storeData.set(key, value)
      })
      electronMocks.BrowserWindow.mockReset()
      electronMocks.BrowserWindow.mockImplementation(function (this: any) {
        Object.assign(this, fakeWindow(200))
      })
    })

    it('wires a real BrowserWindow, preload path and a window-state store', () => {
      const main = fakeWindow(1)
      const m = initResultsWindow(() => main as any)
      expect(getResultsWindowManager()).toBe(m)
      expect(electronMocks.Store).toHaveBeenCalledWith({ name: 'shiny-window-state' })

      electronMocks.storeData.set('resultsWindow', { x: 1, y: 2, width: 700, height: 500 })
      const win = m.open() as any
      expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 1,
          y: 2,
          width: 700,
          height: 500,
          webPreferences: expect.objectContaining({
            preload: expect.stringMatching(/preload[\\/]dist[\\/]index\.js$/),
          }),
        })
      )
      // Packaged: loads the built renderer with the results hash
      expect(win.loadFile).toHaveBeenCalledWith(
        expect.stringMatching(/renderer[\\/]dist[\\/]index\.html$/),
        { hash: RESULTS_WINDOW_HASH }
      )

      // Bounds round-trip through the store
      win.emit('resize')
      expect(electronMocks.storeData.get('resultsWindow')).toEqual({
        x: 10,
        y: 20,
        width: 800,
        height: 600,
      })
    })
  })
})
