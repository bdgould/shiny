import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, manager, getManager } = vi.hoisted(() => {
  const manager = {
    open: vi.fn(),
    close: vi.fn(),
    isOpen: vi.fn(),
    isMainSender: vi.fn(),
    isResultsSender: vi.fn(),
    sendToResults: vi.fn(),
    sendToMain: vi.fn(),
  }
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    manager,
    getManager: vi.fn(() => manager as typeof manager | null),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('../../resultsWindow.js', () => ({ getResultsWindowManager: getManager }))

const MAIN_ID = 1
const RESULTS_ID = 2
const fromMain = { senderFrame: { url: 'file:///app/index.html' }, sender: { id: MAIN_ID } }
const fromResults = {
  senderFrame: { url: 'file:///app/index.html#results' },
  sender: { id: RESULTS_ID },
}

function handler(channel: string) {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler for ${channel}`)
  return fn
}

const channels = [
  'resultsWindow:open',
  'resultsWindow:close',
  'resultsWindow:isOpen',
  'resultsWindow:publish',
  'resultsWindow:ready',
  'resultsWindow:execute',
]

describe('resultsWindow IPC handlers', () => {
  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await import('../resultsWindow.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getManager.mockReturnValue(manager)
    manager.isMainSender.mockImplementation((id: number) => id === MAIN_ID)
    manager.isResultsSender.mockImplementation((id: number) => id === RESULTS_ID)
    manager.sendToResults.mockReturnValue(true)
    manager.sendToMain.mockReturnValue(true)
    manager.isOpen.mockReturnValue(true)
  })

  it('registers every channel', () => {
    for (const c of channels) expect(handlers.has(c)).toBe(true)
  })

  it.each(channels)('%s rejects unauthorized senders', async (channel) => {
    const fn = handler(channel)
    await expect(
      fn({ senderFrame: { url: 'https://evil.example' }, sender: { id: MAIN_ID } }, {})
    ).rejects.toThrow('Unauthorized IPC sender')
    for (const m of Object.values(manager)) expect(m).not.toHaveBeenCalled()
  })

  it('open creates the window and reports success', async () => {
    await expect(handler('resultsWindow:open')(fromMain)).resolves.toBe(true)
    expect(manager.open).toHaveBeenCalledTimes(1)
  })

  it('close and isOpen delegate', async () => {
    await handler('resultsWindow:close')(fromResults)
    expect(manager.close).toHaveBeenCalledTimes(1)
    await expect(handler('resultsWindow:isOpen')(fromMain)).resolves.toBe(true)
  })

  it('publish relays state only from the main window', async () => {
    const state = { tabName: 'Untitled-1', results: null }
    await expect(handler('resultsWindow:publish')(fromMain, state)).resolves.toBe(true)
    expect(manager.sendToResults).toHaveBeenCalledWith('resultsWindow:state', state)

    await expect(handler('resultsWindow:publish')(fromResults, state)).resolves.toBe(false)
    expect(manager.sendToResults).toHaveBeenCalledTimes(1)
  })

  it('ready and execute relay only from the results window', async () => {
    await expect(handler('resultsWindow:ready')(fromResults)).resolves.toBe(true)
    expect(manager.sendToMain).toHaveBeenCalledWith('resultsWindow:ready')
    await expect(handler('resultsWindow:execute')(fromResults)).resolves.toBe(true)
    expect(manager.sendToMain).toHaveBeenCalledWith('resultsWindow:execute')

    await expect(handler('resultsWindow:ready')(fromMain)).resolves.toBe(false)
    await expect(handler('resultsWindow:execute')(fromMain)).resolves.toBe(false)
    expect(manager.sendToMain).toHaveBeenCalledTimes(2)
  })

  it('is inert before the manager is initialised', async () => {
    getManager.mockReturnValue(null)
    await expect(handler('resultsWindow:open')(fromMain)).resolves.toBe(false)
    await expect(handler('resultsWindow:close')(fromMain)).resolves.toBeUndefined()
    await expect(handler('resultsWindow:isOpen')(fromMain)).resolves.toBe(false)
    await expect(handler('resultsWindow:publish')(fromMain, {})).resolves.toBe(false)
    await expect(handler('resultsWindow:ready')(fromResults)).resolves.toBe(false)
    await expect(handler('resultsWindow:execute')(fromResults)).resolves.toBe(false)
  })
})
