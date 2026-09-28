import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, backendService, provider, getProvider } = vi.hoisted(() => {
  const provider = { execute: vi.fn() }
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    backendService: { getBackend: vi.fn(), getCredentials: vi.fn() },
    provider,
    getProvider: vi.fn(() => provider),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('../../services/index.js', () => ({ getBackendService: () => backendService }))
vi.mock('../../backends/BackendFactory.js', () => ({ BackendFactory: { getProvider } }))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }
const config = { id: 'b1', name: 'B', type: 'sparql-1.1', endpoint: 'https://x/sparql' }

function run(event: any, args: any) {
  return handlers.get('query:execute')!(event, args)
}

describe('query:execute', () => {
  beforeAll(async () => {
    await import('../query.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects unauthorized senders', async () => {
    for (const event of [
      { senderFrame: { url: 'https://evil.example' } },
      { senderFrame: { url: 'http://localhost:5174' } },
      { senderFrame: null },
    ]) {
      await expect(run(event, { query: 'SELECT', backendId: 'b1' })).rejects.toThrow(
        'Unauthorized IPC sender'
      )
    }
    expect(backendService.getBackend).not.toHaveBeenCalled()
  })

  it('rejects non-string queries', async () => {
    await expect(run(okEvent, { query: 42, backendId: 'b1' })).rejects.toThrow(
      'Invalid query parameter'
    )
  })

  it.each([undefined, '', 1])('rejects invalid backend id %s', async (backendId) => {
    await expect(run(okEvent, { query: 'SELECT', backendId })).rejects.toThrow('Invalid backend ID')
  })

  it('rejects queries over 100KB', async () => {
    await expect(run(okEvent, { query: 'a'.repeat(100001), backendId: 'b1' })).rejects.toThrow(
      'Query too large'
    )
    expect(backendService.getBackend).not.toHaveBeenCalled()
  })

  it('accepts a query of exactly 100000 characters', async () => {
    backendService.getBackend.mockResolvedValue(config)
    backendService.getCredentials.mockResolvedValue(null)
    provider.execute.mockResolvedValue({ ok: true })
    await expect(run(okEvent, { query: 'a'.repeat(100000), backendId: 'b1' })).resolves.toEqual({
      ok: true,
    })
  })

  it('fails when the backend does not exist', async () => {
    backendService.getBackend.mockResolvedValue(null)
    await expect(run(okEvent, { query: 'SELECT', backendId: 'missing' })).rejects.toThrow(
      'Query execution failed: Backend not found: missing'
    )
  })

  it('executes via the provider for the backend type with credentials', async () => {
    const creds = { username: 'u', password: 'p' }
    backendService.getBackend.mockResolvedValue(config)
    backendService.getCredentials.mockResolvedValue(creds)
    provider.execute.mockResolvedValue({ data: 'result' })

    const result = await run(okEvent, { query: 'SELECT * {}', backendId: 'b1' })

    expect(result).toEqual({ data: 'result' })
    expect(getProvider).toHaveBeenCalledWith('sparql-1.1')
    expect(provider.execute).toHaveBeenCalledWith(config, 'SELECT * {}', creds)
  })

  it('passes undefined credentials when none are stored', async () => {
    backendService.getBackend.mockResolvedValue(config)
    backendService.getCredentials.mockResolvedValue(null)
    provider.execute.mockResolvedValue({})
    await run(okEvent, { query: 'ASK {}', backendId: 'b1' })
    expect(provider.execute).toHaveBeenCalledWith(config, 'ASK {}', undefined)
  })

  it('wraps provider errors with cause', async () => {
    const original = new Error('HTTP 500')
    backendService.getBackend.mockResolvedValue(config)
    backendService.getCredentials.mockResolvedValue(null)
    provider.execute.mockRejectedValue(original)
    const err = await run(okEvent, { query: 'SELECT', backendId: 'b1' }).catch((e: Error) => e)
    expect(err.message).toBe('Query execution failed: HTTP 500')
    expect(err.cause).toBe(original)
  })

  it('wraps non-Error throws as unknown errors', async () => {
    backendService.getBackend.mockResolvedValue(config)
    backendService.getCredentials.mockResolvedValue(null)
    provider.execute.mockRejectedValue('boom')
    await expect(run(okEvent, { query: 'SELECT', backendId: 'b1' })).rejects.toThrow(
      'Query execution failed: Unknown error'
    )
  })
})
