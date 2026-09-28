import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, cacheService } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  cacheService: { fetchCache: vi.fn(), testQuery: vi.fn() },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('../../services/index.js', () => ({ getOntologyCacheService: () => cacheService }))

function okEvent() {
  return { senderFrame: { url: 'file:///app/index.html' }, sender: { send: vi.fn() } }
}

describe('ontology cache IPC handlers', () => {
  beforeAll(async () => {
    await import('../ontologyCache')
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cache:fetch', () => {
    const fetch = (event: any, args: any) => handlers.get('cache:fetch')!(event, args)

    it('rejects unauthorized senders', async () => {
      await expect(
        fetch({ senderFrame: { url: 'https://evil.example' } }, { backendId: 'b' })
      ).rejects.toThrow('Unauthorized IPC sender')
      await expect(fetch({ senderFrame: null }, { backendId: 'b' })).rejects.toThrow(
        'Unauthorized IPC sender'
      )
      expect(cacheService.fetchCache).not.toHaveBeenCalled()
    })

    it.each(['', undefined, 3])('rejects invalid backend id %s', async (backendId) => {
      await expect(fetch(okEvent(), { backendId })).rejects.toThrow('Invalid backend ID')
    })

    it('fetches without a progress callback when not requested', async () => {
      cacheService.fetchCache.mockResolvedValue({ classes: [] })
      await expect(fetch(okEvent(), { backendId: 'b' })).resolves.toEqual({ classes: [] })
      expect(cacheService.fetchCache).toHaveBeenCalledWith('b', undefined)
    })

    it('forwards progress updates to the renderer when requested', async () => {
      const event = okEvent()
      cacheService.fetchCache.mockImplementation(async (_id: string, cb: (p: any) => void) => {
        cb({ phase: 'classes', percent: 50 })
        return { done: true }
      })
      await expect(fetch(event, { backendId: 'b', onProgress: true })).resolves.toEqual({
        done: true,
      })
      expect(event.sender.send).toHaveBeenCalledWith('cache:progress', {
        backendId: 'b',
        progress: { phase: 'classes', percent: 50 },
      })
    })
  })

  describe('cache:testQuery', () => {
    const test = (event: any, args: any) => handlers.get('cache:testQuery')!(event, args)

    it('rejects unauthorized senders', async () => {
      await expect(
        test({ senderFrame: { url: 'http://localhost:5174' } }, { backendId: 'b', query: 'q' })
      ).rejects.toThrow('Unauthorized IPC sender')
      expect(cacheService.testQuery).not.toHaveBeenCalled()
    })

    it('rejects an invalid backend id', async () => {
      await expect(test(okEvent(), { backendId: '', query: 'q' })).rejects.toThrow(
        'Invalid backend ID'
      )
    })

    it.each(['', undefined, 5])('rejects an invalid query %s', async (query) => {
      await expect(test(okEvent(), { backendId: 'b', query })).rejects.toThrow('Invalid query')
    })

    it('delegates to the cache service', async () => {
      cacheService.testQuery.mockResolvedValue({ success: true, count: 3 })
      await expect(test(okEvent(), { backendId: 'b', query: 'SELECT' })).resolves.toEqual({
        success: true,
        count: 3,
      })
      expect(cacheService.testQuery).toHaveBeenCalledWith('b', 'SELECT')
    })
  })
})
