import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// The cookie jar libraries are replaced with fakes so requests go through the
// mocked axios client.
const { handlers, client, create, wrapper, FakeCookieJar } = vi.hoisted(() => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: {} as Record<string, unknown>,
  }
  class FakeCookieJar {}
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    client,
    create: vi.fn(() => client),
    wrapper: vi.fn((c: unknown) => c),
    FakeCookieJar,
  }
})

vi.mock('axios-cookiejar-support', () => ({ wrapper }))
vi.mock('tough-cookie', () => ({ CookieJar: FakeCookieJar }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('axios', () => ({
  default: { create, isAxiosError: (e: any) => !!e?.isAxiosError },
}))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }
const BASE = 'https://mobi:8443'
const creds = { username: 'admin', password: 'pw' }
const CAT = 'http://mobi.com/catalog-local'
const REC = 'https://mobi.com/records#1'

function axiosError(status?: number, message = 'Request failed', data: any = {}) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: status ? { status, data } : undefined,
  })
}

function invoke(channel: string, event: any, args: any) {
  return handlers.get(channel)!(event, args)
}

describe('mobi IPC handlers', () => {
  beforeAll(async () => {
    await import('../mobi')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockReset()
    client.post.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    ['mobi:authenticate', { baseUrl: BASE, username: 'u', password: 'p' }],
    ['mobi:listCatalogs', { baseUrl: BASE }],
    ['mobi:listRecords', { baseUrl: BASE, catalogId: CAT }],
    ['mobi:listBranches', { baseUrl: BASE, catalogId: CAT, recordId: REC }],
    ['mobi:listRepositories', { baseUrl: BASE }],
  ])('%s rejects unauthorized senders', async (channel, args) => {
    await expect(
      invoke(channel, { senderFrame: { url: 'https://evil.example' } }, args)
    ).rejects.toThrow('Unauthorized IPC sender')
    await expect(invoke(channel, { senderFrame: null }, args)).rejects.toThrow(
      'Unauthorized IPC sender'
    )
    expect(create).not.toHaveBeenCalled()
  })

  describe('mobi:authenticate', () => {
    const auth = (args: any) => invoke('mobi:authenticate', okEvent, args)

    it.each([
      [{ username: 'u', password: 'p' }, 'Base URL is required'],
      [{ baseUrl: BASE, password: 'p' }, 'Username is required'],
      [{ baseUrl: BASE, username: 'u', password: '' }, 'Password is required'],
    ])('validates inputs %#', async (args, message) => {
      await expect(auth(args)).rejects.toThrow(message)
    })

    it('posts form-encoded credentials and attaches a cookie jar', async () => {
      client.post.mockResolvedValue({ data: 'admin' })
      await expect(
        auth({ baseUrl: BASE, username: 'admin', password: 'p&w', allowInsecure: true })
      ).resolves.toEqual({ username: 'admin' })
      expect(client.post).toHaveBeenCalledWith(
        `${BASE}/mobirest/session`,
        'username=admin&password=p%26w',
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      )
      expect(client.defaults.jar).toBeInstanceOf(FakeCookieJar)
      expect(wrapper).toHaveBeenCalledWith(client)
      expect(create).toHaveBeenCalledWith({ timeout: 15000 })
    })

    it('falls back to the supplied username when the body is empty', async () => {
      client.post.mockResolvedValue({ data: '' })
      await expect(auth({ baseUrl: BASE, username: 'u', password: 'p' })).resolves.toEqual({
        username: 'u',
      })
    })

    it.each([
      [axiosError(401), 'Authentication failed: Invalid username or password'],
      [axiosError(500, 'x', { message: 'down' }), 'Authentication failed (500): down'],
      [axiosError(undefined, 'ENOTFOUND'), 'Authentication failed (network error): ENOTFOUND'],
      [new Error('boom'), 'Authentication failed: boom'],
      ['str', 'Authentication failed: Unknown error'],
    ])('maps errors %#', async (err, message) => {
      client.post.mockRejectedValue(err)
      await expect(auth({ baseUrl: BASE, username: 'u', password: 'p' })).rejects.toThrow(message)
    })
  })

  describe('mobi:listCatalogs', () => {
    const list = (args: any) => invoke('mobi:listCatalogs', okEvent, args)

    it('requires a base URL', async () => {
      await expect(list({})).rejects.toThrow('Base URL is required')
    })

    it('logs in when credentials are given and parses JSON-LD catalogs', async () => {
      client.post.mockResolvedValue({ data: 'admin' })
      client.get.mockResolvedValue({
        data: [
          {
            '@id': CAT,
            'http://purl.org/dc/terms/title': [{ '@value': 'Local' }],
            'http://purl.org/dc/terms/description': [{ '@value': 'Local catalog' }],
          },
          { '@id': 'c2', 'dcterms:title': { '@value': 'Obj' }, 'dcterms:description': 'plain' },
          { '@id': 'c3', title: 'Plain', description: { '@value': 'obj desc' } },
          { '@id': 'c4', label: ['raw'] },
          { title: 5 },
          { title: {} },
        ],
      })
      const result = await list({ baseUrl: BASE, credentials: creds })
      expect(client.post).toHaveBeenCalledWith(
        `${BASE}/mobirest/session`,
        'username=admin&password=pw',
        expect.anything()
      )
      expect(client.get).toHaveBeenCalledWith(`${BASE}/mobirest/catalogs`, {
        params: { type: 'local' },
        headers: { Accept: 'application/json' },
      })
      expect(result).toEqual([
        { id: CAT, iri: CAT, title: 'Local', description: 'Local catalog', type: 'local' },
        { id: 'c2', iri: 'c2', title: 'Obj', description: 'plain', type: 'local' },
        { id: 'c3', iri: 'c3', title: 'Plain', description: 'obj desc', type: 'local' },
        { id: 'c4', iri: 'c4', title: 'raw', description: undefined, type: 'local' },
        { id: undefined, iri: undefined, title: 'Untitled', description: undefined, type: 'local' },
        { id: undefined, iri: undefined, title: 'Untitled', description: undefined, type: 'local' },
      ])
    })

    it('skips login without credentials and handles non-array responses', async () => {
      client.get.mockResolvedValue({ data: {} })
      await expect(list({ baseUrl: BASE })).resolves.toEqual([])
      expect(client.post).not.toHaveBeenCalled()
    })

    it.each([
      [axiosError(403), 'Authentication failed. Please check your credentials.'],
      [axiosError(500, 'oops'), 'Failed to fetch catalogs (500): oops'],
      [axiosError(undefined, 'oops'), 'Failed to fetch catalogs (network error): oops'],
      [new Error('bad'), 'Failed to fetch catalogs: bad'],
      [null, 'Failed to fetch catalogs: Unknown error'],
    ])('maps errors %#', async (err, message) => {
      client.get.mockRejectedValue(err)
      await expect(list({ baseUrl: BASE })).rejects.toThrow(message)
    })
  })

  describe('mobi:listRecords', () => {
    const list = (args: any) => invoke('mobi:listRecords', okEvent, args)

    it('validates inputs', async () => {
      await expect(list({ catalogId: CAT })).rejects.toThrow('Base URL is required')
      await expect(list({ baseUrl: BASE })).rejects.toThrow('Catalog ID is required')
    })

    it('fetches records with a type filter and picks the most specific type', async () => {
      client.post.mockResolvedValue({})
      client.get.mockResolvedValue({
        data: [
          {
            '@id': 'r1',
            'dcterms:title': 'Onto',
            '@type': [
              'http://mobi.com/ontologies/catalog#Record',
              'http://mobi.com/ontologies/ontology-editor#OntologyRecord',
              'http://mobi.com/ontologies/catalog#VersionedRDFRecord',
            ],
            'http://purl.org/dc/terms/modified': [{ '@value': '2024-01-01' }],
          },
          {
            '@id': 'r2',
            '@type': [
              'http://mobi.com/ontologies/catalog#Record',
              'http://mobi.com/ontologies/catalog#VersionedRecord',
            ],
            'dcterms:modified': { '@value': '2024-02-02' },
          },
          { '@id': 'r3', '@type': ['a', 'b'], modified: '2024-03-03' },
          { '@id': 'r4', type: 'single' },
          { '@id': 'r5' },
        ],
      })
      const types = ['http://mobi.com/ontologies/ontology-editor#OntologyRecord']
      const records = await list({
        baseUrl: BASE,
        catalogId: CAT,
        recordTypes: types,
        credentials: creds,
      })
      expect(client.post).toHaveBeenCalledTimes(1)
      expect(client.get).toHaveBeenCalledWith(
        `${BASE}/mobirest/catalogs/${encodeURIComponent(CAT)}/records`,
        expect.objectContaining({ params: { offset: 0, limit: 100, type: types } })
      )
      expect(records.map((r: any) => [r.id, r.title, r.type, r.modified])).toEqual([
        ['r1', 'Onto', 'http://mobi.com/ontologies/ontology-editor#OntologyRecord', '2024-01-01'],
        ['r2', 'r2', 'http://mobi.com/ontologies/catalog#VersionedRecord', '2024-02-02'],
        ['r3', 'r3', 'b', '2024-03-03'],
        ['r4', 'r4', 'single', undefined],
        ['r5', 'r5', '', undefined],
      ])
    })

    it('omits the type filter when none given', async () => {
      client.get.mockResolvedValue({ data: null })
      await expect(list({ baseUrl: BASE, catalogId: CAT, recordTypes: [] })).resolves.toEqual([])
      expect(client.get.mock.calls[0][1].params).toEqual({ offset: 0, limit: 100 })
      expect(client.post).not.toHaveBeenCalled()
    })

    it.each([
      [axiosError(401), 'Authentication failed. Please check your credentials.'],
      [axiosError(404), 'Catalog not found.'],
      [axiosError(500, 'x', { message: 'srv' }), 'Failed to fetch records (500): srv'],
      [axiosError(undefined, 'net'), 'Failed to fetch records (network error): net'],
      [new Error('e'), 'Failed to fetch records: e'],
      [undefined, 'Failed to fetch records: Unknown error'],
    ])('maps errors %#', async (err, message) => {
      client.get.mockRejectedValue(err)
      await expect(list({ baseUrl: BASE, catalogId: CAT })).rejects.toThrow(message)
    })
  })

  describe('mobi:listBranches', () => {
    const list = (args: any) => invoke('mobi:listBranches', okEvent, args)

    it('validates inputs', async () => {
      await expect(list({ catalogId: CAT, recordId: REC })).rejects.toThrow('Base URL is required')
      await expect(list({ baseUrl: BASE, recordId: REC })).rejects.toThrow('Catalog ID is required')
      await expect(list({ baseUrl: BASE, catalogId: CAT })).rejects.toThrow('Record ID is required')
    })

    it('returns branches with MASTER first then alphabetical', async () => {
      client.post.mockResolvedValue({})
      client.get.mockResolvedValue({
        data: [
          { '@id': 'b-z', title: 'zeta' },
          { '@id': 'b-a', title: 'alpha', modified: '2024' },
          { '@id': 'b-m', title: 'MASTER' },
          { '@id': 'b-c', title: 'charlie' },
        ],
      })
      const branches = await list({
        baseUrl: BASE,
        catalogId: CAT,
        recordId: REC,
        credentials: creds,
      })
      expect(branches.map((b: any) => b.title)).toEqual(['MASTER', 'alpha', 'charlie', 'zeta'])
      expect(branches[1]).toEqual({ id: 'b-a', iri: 'b-a', title: 'alpha', createdDate: '2024' })
      expect(client.get).toHaveBeenCalledWith(
        `${BASE}/mobirest/catalogs/${encodeURIComponent(CAT)}/records/${encodeURIComponent(REC)}/branches`,
        expect.objectContaining({ params: { offset: 0, limit: 100 } })
      )
    })

    it('handles non-array responses', async () => {
      client.get.mockResolvedValue({ data: 'nope' })
      await expect(list({ baseUrl: BASE, catalogId: CAT, recordId: REC })).resolves.toEqual([])
    })

    it.each([
      [axiosError(403), 'Authentication failed. Please check your credentials.'],
      [axiosError(404), 'Record not found or does not have branches.'],
      [axiosError(500, 'm'), 'Failed to fetch branches (500): m'],
      [axiosError(undefined, 'm'), 'Failed to fetch branches (network error): m'],
      [new Error('e'), 'Failed to fetch branches: e'],
      [0, 'Failed to fetch branches: Unknown error'],
    ])('maps errors %#', async (err, message) => {
      client.get.mockRejectedValue(err)
      await expect(list({ baseUrl: BASE, catalogId: CAT, recordId: REC })).rejects.toThrow(message)
    })
  })

  describe('mobi:listRepositories', () => {
    const list = (args: any) => invoke('mobi:listRepositories', okEvent, args)

    it('requires a base URL', async () => {
      await expect(list({ baseUrl: '' })).rejects.toThrow('Base URL is required')
    })

    it('builds repository IRIs from ids', async () => {
      client.post.mockResolvedValue({})
      client.get.mockResolvedValue({
        data: [{ id: 'system', title: 'System', description: 'sys' }, { id: 'prov' }],
      })
      await expect(list({ baseUrl: BASE, credentials: creds })).resolves.toEqual([
        {
          id: 'http://mobi.com/repositories/system',
          iri: 'http://mobi.com/repositories/system',
          title: 'System',
          description: 'sys',
        },
        {
          id: 'http://mobi.com/repositories/prov',
          iri: 'http://mobi.com/repositories/prov',
          title: 'prov',
          description: undefined,
        },
      ])
      expect(client.post).toHaveBeenCalledTimes(1)
    })

    it('handles non-array responses', async () => {
      client.get.mockResolvedValue({ data: {} })
      await expect(list({ baseUrl: BASE })).resolves.toEqual([])
    })

    it.each([
      [axiosError(401), 'Authentication failed. Please check your credentials.'],
      [axiosError(500, 'm'), 'Failed to fetch repositories (500): m'],
      [axiosError(undefined, 'm'), 'Failed to fetch repositories (network error): m'],
      [new Error('e'), 'Failed to fetch repositories: e'],
      [false, 'Failed to fetch repositories: Unknown error'],
    ])('maps errors %#', async (err, message) => {
      client.get.mockRejectedValue(err)
      await expect(list({ baseUrl: BASE })).rejects.toThrow(message)
    })
  })
})
