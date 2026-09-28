import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, backendService } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  backendService: {
    getAllBackends: vi.fn(),
    createBackend: vi.fn(),
    updateBackend: vi.fn(),
    deleteBackend: vi.fn(),
    testConnection: vi.fn(),
    getCredentials: vi.fn(),
    getSelectedBackendId: vi.fn(),
    selectBackend: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))

vi.mock('../../services/index.js', () => ({
  getBackendService: () => backendService,
}))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }
const badEvent = { senderFrame: { url: 'https://evil.example' } }
const nullEvent = { senderFrame: null }

function invoke(channel: string, event: any, ...args: any[]) {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`No handler for ${channel}`)
  return fn(event, ...args)
}

const channelArgs: Record<string, any[]> = {
  'backends:getAll': [],
  'backends:create': [{ config: { name: 'x' } }],
  'backends:update': [{ id: 'a', updates: {} }],
  'backends:delete': [{ id: 'a' }],
  'backends:testConnection': [{ id: 'a' }],
  'backends:getCredentials': [{ id: 'a' }],
  'backends:getSelected': [],
  'backends:setSelected': [{ id: 'a' }],
}

describe('backends IPC handlers', () => {
  beforeAll(async () => {
    await import('../backends.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers every backend channel', () => {
    for (const channel of Object.keys(channelArgs)) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  describe.each(Object.entries(channelArgs))('%s authorization', (channel, args) => {
    it('rejects a foreign sender without touching the service', async () => {
      await expect(invoke(channel, badEvent, ...args)).rejects.toThrow('Unauthorized IPC sender')
      await expect(invoke(channel, nullEvent, ...args)).rejects.toThrow('Unauthorized IPC sender')
      for (const fn of Object.values(backendService)) {
        expect(fn).not.toHaveBeenCalled()
      }
    })
  })

  it('getAll returns all backends', async () => {
    backendService.getAllBackends.mockResolvedValue([{ id: '1' }])
    await expect(invoke('backends:getAll', okEvent)).resolves.toEqual([{ id: '1' }])
  })

  it('getAll accepts the dev server origin', async () => {
    backendService.getAllBackends.mockResolvedValue([])
    await expect(
      invoke('backends:getAll', { senderFrame: { url: 'http://localhost:5173/' } })
    ).resolves.toEqual([])
  })

  describe('create', () => {
    it.each([undefined, null, 'string', 42])('rejects invalid config %s', async (config) => {
      await expect(invoke('backends:create', okEvent, { config })).rejects.toThrow(
        'Invalid backend config'
      )
      expect(backendService.createBackend).not.toHaveBeenCalled()
    })

    it('delegates config and credentials to the service', async () => {
      const config = { name: 'Test' }
      const credentials = { username: 'u', password: 'p' }
      backendService.createBackend.mockResolvedValue({ id: 'new', ...config })
      await expect(invoke('backends:create', okEvent, { config, credentials })).resolves.toEqual({
        id: 'new',
        name: 'Test',
      })
      expect(backendService.createBackend).toHaveBeenCalledWith(config, credentials)
    })
  })

  describe('update', () => {
    it.each(['', undefined, 5])('rejects invalid id %s', async (id) => {
      await expect(invoke('backends:update', okEvent, { id, updates: {} })).rejects.toThrow(
        'Invalid backend ID'
      )
    })

    it.each([undefined, null, 'x'])('rejects invalid updates %s', async (updates) => {
      await expect(invoke('backends:update', okEvent, { id: 'a', updates })).rejects.toThrow(
        'Invalid backend updates'
      )
      expect(backendService.updateBackend).not.toHaveBeenCalled()
    })

    it('delegates to the service', async () => {
      backendService.updateBackend.mockResolvedValue({ id: 'a', name: 'B' })
      const result = await invoke('backends:update', okEvent, {
        id: 'a',
        updates: { name: 'B' },
        credentials: { token: 't' },
      })
      expect(result).toEqual({ id: 'a', name: 'B' })
      expect(backendService.updateBackend).toHaveBeenCalledWith('a', { name: 'B' }, { token: 't' })
    })
  })

  describe('delete', () => {
    it('rejects an invalid id', async () => {
      await expect(invoke('backends:delete', okEvent, { id: '' })).rejects.toThrow(
        'Invalid backend ID'
      )
    })

    it('deletes and reports success', async () => {
      backendService.deleteBackend.mockResolvedValue(undefined)
      await expect(invoke('backends:delete', okEvent, { id: 'a' })).resolves.toEqual({
        success: true,
      })
      expect(backendService.deleteBackend).toHaveBeenCalledWith('a')
    })

    it('propagates service errors', async () => {
      backendService.deleteBackend.mockRejectedValue(new Error('Backend not found: a'))
      await expect(invoke('backends:delete', okEvent, { id: 'a' })).rejects.toThrow(
        'Backend not found: a'
      )
    })
  })

  describe('testConnection', () => {
    it('rejects an invalid id', async () => {
      await expect(invoke('backends:testConnection', okEvent, { id: 7 })).rejects.toThrow(
        'Invalid backend ID'
      )
    })

    it('returns the validation result', async () => {
      backendService.testConnection.mockResolvedValue({ valid: false, error: 'nope' })
      await expect(invoke('backends:testConnection', okEvent, { id: 'a' })).resolves.toEqual({
        valid: false,
        error: 'nope',
      })
      expect(backendService.testConnection).toHaveBeenCalledWith('a')
    })
  })

  describe('getCredentials', () => {
    it('rejects an invalid id', async () => {
      await expect(invoke('backends:getCredentials', okEvent, { id: null })).rejects.toThrow(
        'Invalid backend ID'
      )
    })

    it('returns credentials', async () => {
      backendService.getCredentials.mockResolvedValue({ username: 'u' })
      await expect(invoke('backends:getCredentials', okEvent, { id: 'a' })).resolves.toEqual({
        username: 'u',
      })
    })

    it('normalizes missing credentials to null', async () => {
      backendService.getCredentials.mockResolvedValue(undefined)
      await expect(invoke('backends:getCredentials', okEvent, { id: 'a' })).resolves.toBeNull()
    })
  })

  it('getSelected returns the selected id', async () => {
    backendService.getSelectedBackendId.mockReturnValue('sel')
    await expect(invoke('backends:getSelected', okEvent)).resolves.toBe('sel')
  })

  describe('setSelected', () => {
    it.each(['', 3, undefined])('rejects invalid id %s', async (id) => {
      await expect(invoke('backends:setSelected', okEvent, { id })).rejects.toThrow(
        'Invalid backend ID'
      )
      expect(backendService.selectBackend).not.toHaveBeenCalled()
    })

    it('selects a backend', async () => {
      await expect(invoke('backends:setSelected', okEvent, { id: 'a' })).resolves.toEqual({
        success: true,
      })
      expect(backendService.selectBackend).toHaveBeenCalledWith('a')
    })

    it('allows null to deselect', async () => {
      await expect(invoke('backends:setSelected', okEvent, { id: null })).resolves.toEqual({
        success: true,
      })
      expect(backendService.selectBackend).toHaveBeenCalledWith(null)
    })
  })
})
