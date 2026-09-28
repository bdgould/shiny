import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, client, create } = vi.hoisted(() => {
  const client = { get: vi.fn(), post: vi.fn() }
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    client,
    create: vi.fn(() => client),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('axios', () => ({
  default: { create, isAxiosError: (e: any) => !!e?.isAxiosError },
}))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }
const badEvent = { senderFrame: { url: 'https://evil.example' } }
const BASE = 'http://gdb:7200'

function axiosError(status?: number, message = 'Request failed') {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: status ? { status, data: {} } : undefined,
  })
}

function invoke(channel: string, event: any, args: any) {
  return handlers.get(channel)!(event, args)
}

describe('graphdb IPC handlers', () => {
  beforeAll(async () => {
    await import('../graphdb.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockReset()
    client.post.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    ['graphdb:authenticate', { baseUrl: BASE, username: 'u', password: 'p' }],
    ['graphdb:getServerInfo', { baseUrl: BASE }],
    ['graphdb:listRepositories', { baseUrl: BASE }],
    ['graphdb:getRepositoryDetails', { baseUrl: BASE, repositoryId: 'r' }],
    ['graphdb:testConnection', { baseUrl: BASE, repositoryId: 'r' }],
  ])('%s rejects unauthorized senders', async (channel, args) => {
    await expect(invoke(channel, badEvent, args)).rejects.toThrow('Unauthorized IPC sender')
    await expect(invoke(channel, { senderFrame: null }, args)).rejects.toThrow(
      'Unauthorized IPC sender'
    )
    expect(create).not.toHaveBeenCalled()
  })

  describe('graphdb:authenticate', () => {
    it.each([
      { baseUrl: '', username: 'u', password: 'p' },
      { baseUrl: BASE, username: '', password: 'p' },
      { baseUrl: BASE, username: 'u', password: '' },
    ])('requires baseUrl, username and password', async (args) => {
      await expect(invoke('graphdb:authenticate', okEvent, args)).rejects.toThrow(
        'Base URL, username, and password are required'
      )
    })

    it('uses the v10+ JSON login and strips trailing slashes', async () => {
      client.post.mockResolvedValue({ headers: { authorization: 'GDB tok' } })
      const result = await invoke('graphdb:authenticate', okEvent, {
        baseUrl: `${BASE}//`,
        username: 'u',
        password: 'p',
        allowInsecure: true,
      })
      expect(result).toEqual({ success: true, token: 'GDB tok', username: 'u' })
      expect(client.post).toHaveBeenCalledWith(
        `${BASE}/rest/login`,
        { username: 'u', password: 'p' },
        expect.anything()
      )
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }))
    })

    it('falls back to the v9 header login', async () => {
      client.post
        .mockRejectedValueOnce(axiosError(404))
        .mockResolvedValueOnce({ headers: { authorization: 'GDB v9' } })
      const result = await invoke('graphdb:authenticate', okEvent, {
        baseUrl: BASE,
        username: 'a b',
        password: 'p',
      })
      expect(result.token).toBe('GDB v9')
      expect(client.post).toHaveBeenLastCalledWith(`${BASE}/rest/login/a%20b`, null, {
        headers: { 'X-GraphDB-Password': 'p' },
      })
    })

    it('reports invalid credentials on a v9 401', async () => {
      client.post.mockRejectedValueOnce(axiosError(401)).mockRejectedValueOnce(axiosError(401))
      await expect(
        invoke('graphdb:authenticate', okEvent, { baseUrl: BASE, username: 'u', password: 'p' })
      ).rejects.toThrow('Authentication failed: Invalid username or password')
    })

    it('rethrows other v9 errors', async () => {
      client.post.mockRejectedValueOnce(axiosError(500)).mockRejectedValueOnce(axiosError(500, 'x'))
      await expect(
        invoke('graphdb:authenticate', okEvent, { baseUrl: BASE, username: 'u', password: 'p' })
      ).rejects.toThrow('x')
    })

    it('fails when no token is returned', async () => {
      client.post.mockResolvedValue({ headers: {} })
      await expect(
        invoke('graphdb:authenticate', okEvent, { baseUrl: BASE, username: 'u', password: 'p' })
      ).rejects.toThrow('Authentication failed: No token received')
    })

    it('wraps non-Error throws', async () => {
      client.post.mockResolvedValueOnce({ headers: {} }).mockRejectedValueOnce('weird')
      await expect(
        invoke('graphdb:authenticate', okEvent, { baseUrl: BASE, username: 'u', password: 'p' })
      ).rejects.toThrow('Authentication failed: Unknown error')
    })
  })

  describe('graphdb:getServerInfo', () => {
    it('requires a base URL', async () => {
      await expect(invoke('graphdb:getServerInfo', okEvent, { baseUrl: '' })).rejects.toThrow(
        'Base URL is required'
      )
    })

    it.each([
      ['11.0.1', '11.x'],
      ['10.6.3', '10.x'],
      ['9.11.0', '9.x'],
      ['8.0', 'unknown'],
    ])('detects version %s as %s', async (version, family) => {
      client.get.mockResolvedValue({ data: { productVersion: version } })
      await expect(invoke('graphdb:getServerInfo', okEvent, { baseUrl: BASE })).resolves.toEqual({
        productName: 'GraphDB',
        productVersion: version,
        versionFamily: family,
      })
    })

    it('accepts a plain string version response', async () => {
      client.get.mockResolvedValue({ data: '10.2.0' })
      const info = await invoke('graphdb:getServerInfo', okEvent, { baseUrl: BASE })
      expect(info.versionFamily).toBe('10.x')
    })

    it('handles a nested version object', async () => {
      client.get.mockResolvedValue({ data: { productVersion: { productVersion: '11.1' } } })
      const info = await invoke('graphdb:getServerInfo', okEvent, { baseUrl: BASE })
      expect(info.productVersion).toBe('11.1')
    })

    it('falls back to confirming connectivity via /repositories', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url.endsWith('/rest/info/version')) throw axiosError(404)
        if (url.endsWith('/protocol')) return { data: '12' }
        return { data: [] }
      })
      await expect(invoke('graphdb:getServerInfo', okEvent, { baseUrl: BASE })).resolves.toEqual({
        productName: 'GraphDB (version unknown)',
        productVersion: '',
        versionFamily: 'unknown',
      })
    })

    it('reports plain GraphDB with unknown version when everything fails', async () => {
      client.get.mockRejectedValue(axiosError(500))
      await expect(invoke('graphdb:getServerInfo', okEvent, { baseUrl: BASE })).resolves.toEqual({
        productName: 'GraphDB',
        productVersion: '',
        versionFamily: 'unknown',
      })
    })

    it('sends a GDB token when credentials authenticate', async () => {
      client.post.mockResolvedValue({ headers: { authorization: 'GDB t' } })
      client.get.mockResolvedValue({ data: { productVersion: '10.0' } })
      await invoke('graphdb:getServerInfo', okEvent, {
        baseUrl: BASE,
        credentials: { username: 'u', password: 'p' },
      })
      expect(client.get).toHaveBeenCalledWith(`${BASE}/rest/info/version`, {
        headers: { Authorization: 'GDB t' },
      })
    })

    it('falls back to Basic auth when token login fails', async () => {
      client.post.mockRejectedValue(axiosError(401))
      client.get.mockResolvedValue({ data: { productVersion: '10.0' } })
      await invoke('graphdb:getServerInfo', okEvent, {
        baseUrl: BASE,
        credentials: { username: 'u', password: 'p' },
      })
      expect(client.get).toHaveBeenCalledWith(`${BASE}/rest/info/version`, {
        headers: { Authorization: `Basic ${Buffer.from('u:p').toString('base64')}` },
      })
    })
  })

  describe('graphdb:listRepositories', () => {
    it('requires a base URL', async () => {
      await expect(invoke('graphdb:listRepositories', okEvent, {})).rejects.toThrow(
        'Base URL is required'
      )
    })

    it('parses and sorts the REST API response', async () => {
      client.get.mockResolvedValue({
        data: [
          { id: 'zeta', title: 'Zeta', state: 'RUNNING' },
          { id: 'err', state: 'failed', readable: false },
          { id: 'init', state: 'starting', writable: false },
          { id: 'alpha', state: 'active', uri: 'custom://alpha', type: 'graphdb' },
          { id: 'off', state: undefined },
          { id: 'weird', state: 'paused' },
        ],
      })
      const repos = await invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })
      expect(repos.map((r: any) => [r.id, r.state])).toEqual([
        ['alpha', 'active'],
        ['zeta', 'active'],
        ['init', 'initializing'],
        ['off', 'inactive'],
        ['weird', 'inactive'],
        ['err', 'error'],
      ])
      expect(repos[0]).toMatchObject({ uri: 'custom://alpha', readable: true, type: 'graphdb' })
      expect(repos[1].uri).toBe(`${BASE}/repositories/zeta`)
      expect(repos.find((r: any) => r.id === 'err').readable).toBe(false)
      expect(repos.find((r: any) => r.id === 'init').writable).toBe(false)
    })

    it('treats a non-array REST response as empty', async () => {
      client.get.mockResolvedValue({ data: { nope: true } })
      await expect(invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })).resolves.toEqual(
        []
      )
    })

    it('falls back to the RDF4J endpoint', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url.includes('/rest/')) throw axiosError(404)
        return {
          data: {
            results: {
              bindings: [
                { id: { value: 'b' }, readable: { value: 'false' } },
                { id: { value: 'a' }, title: { value: 'A' }, uri: { value: 'u:a' } },
                {},
              ],
            },
          },
        }
      })
      const repos = await invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })
      expect(repos).toEqual([
        {
          id: '',
          title: '',
          uri: `${BASE}/repositories/undefined`,
          state: 'active',
          readable: true,
          writable: true,
        },
        { id: 'a', title: 'A', uri: 'u:a', state: 'active', readable: true, writable: true },
        {
          id: 'b',
          title: 'b',
          uri: `${BASE}/repositories/b`,
          state: 'active',
          readable: false,
          writable: true,
        },
      ])
    })

    it('handles an RDF4J response without bindings', async () => {
      client.get.mockRejectedValueOnce(axiosError(404)).mockResolvedValueOnce({ data: {} })
      await expect(invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })).resolves.toEqual(
        []
      )
    })

    it.each([401, 403])('maps %s to an authentication error', async (status) => {
      client.get.mockRejectedValue(axiosError(status))
      await expect(invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })).rejects.toThrow(
        'Authentication failed. Please check your credentials.'
      )
    })

    it('reports other HTTP errors with status', async () => {
      client.get.mockRejectedValue(axiosError(500, 'Server Error'))
      await expect(invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })).rejects.toThrow(
        'Failed to list repositories (500): Server Error'
      )
    })

    it('reports non-axios errors generically', async () => {
      client.get.mockRejectedValueOnce(axiosError(404)).mockRejectedValueOnce(new Error('x'))
      await expect(invoke('graphdb:listRepositories', okEvent, { baseUrl: BASE })).rejects.toThrow(
        'Failed to list repositories'
      )
    })
  })

  describe('graphdb:getRepositoryDetails', () => {
    it.each([{ baseUrl: BASE }, { repositoryId: 'r' }])('validates inputs', async (args) => {
      await expect(invoke('graphdb:getRepositoryDetails', okEvent, args)).rejects.toThrow(
        'Base URL and repository ID are required'
      )
    })

    it('returns namespaces and triple count', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url.endsWith('/namespaces')) {
          return {
            data: {
              results: {
                bindings: [{ prefix: { value: 'ex' }, namespace: { value: 'http://ex/' } }, {}],
              },
            },
          }
        }
        return { data: '1234' }
      })
      const details = await invoke('graphdb:getRepositoryDetails', okEvent, {
        baseUrl: BASE,
        repositoryId: 'my repo',
      })
      expect(details).toEqual({
        repositoryId: 'my repo',
        namespaces: [
          { prefix: 'ex', namespace: 'http://ex/' },
          { prefix: '', namespace: '' },
        ],
        tripleCount: 1234,
      })
      expect(client.get).toHaveBeenCalledWith(
        `${BASE}/repositories/my%20repo/namespaces`,
        expect.anything()
      )
    })

    it('tolerates failures of both sub-requests', async () => {
      client.get.mockRejectedValue(axiosError(500))
      await expect(
        invoke('graphdb:getRepositoryDetails', okEvent, { baseUrl: BASE, repositoryId: 'r' })
      ).resolves.toEqual({ repositoryId: 'r', namespaces: [], tripleCount: undefined })
    })

    it('treats a non-numeric size as undefined', async () => {
      client.get.mockImplementation(async (url: string) =>
        url.endsWith('/size') ? { data: 'n/a' } : { data: {} }
      )
      const details = await invoke('graphdb:getRepositoryDetails', okEvent, {
        baseUrl: BASE,
        repositoryId: 'r',
      })
      expect(details.tripleCount).toBeUndefined()
    })
  })

  describe('graphdb:testConnection', () => {
    it('validates inputs', async () => {
      await expect(invoke('graphdb:testConnection', okEvent, { baseUrl: BASE })).rejects.toThrow(
        'Base URL and repository ID are required'
      )
    })

    it('posts a test query and reports success', async () => {
      client.post.mockResolvedValue({ data: {} })
      await expect(
        invoke('graphdb:testConnection', okEvent, { baseUrl: `${BASE}/`, repositoryId: 'r/1' })
      ).resolves.toEqual({ success: true, message: "Successfully connected to repository 'r/1'" })
      expect(client.post).toHaveBeenCalledWith(
        `${BASE}/repositories/r%2F1`,
        'SELECT * WHERE { ?s ?p ?o } LIMIT 1',
        expect.objectContaining({ timeout: 10000 })
      )
    })

    it.each([
      [401, 'Authentication failed'],
      [403, 'Authentication failed'],
      [404, 'Repository not found'],
      [500, 'Connection failed (500)'],
    ])('maps HTTP %s to a failure result', async (status, message) => {
      client.post.mockRejectedValue(axiosError(status))
      await expect(
        invoke('graphdb:testConnection', okEvent, { baseUrl: BASE, repositoryId: 'r' })
      ).resolves.toEqual({ success: false, message })
    })

    it('maps non-axios errors to a generic failure', async () => {
      client.post.mockRejectedValue(new Error('boom'))
      await expect(
        invoke('graphdb:testConnection', okEvent, { baseUrl: BASE, repositoryId: 'r' })
      ).resolves.toEqual({ success: false, message: 'Connection failed' })
    })
  })
})
