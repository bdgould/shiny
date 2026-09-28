import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { http, HttpResponse, delay } from 'msw'
import { setupServer } from 'msw/node'
import { GraphDBProvider } from '../GraphDBProvider'
import type { BackendConfig, BackendCredentials } from '../../types'

const BASE = 'http://graphdb.test:7200'
const REPO_URL = `${BASE}/repositories/my%20repo`

interface CapturedRequest {
  method: string
  url: URL
  headers: Headers
  body: string
}

const captured: CapturedRequest[] = []
const server = setupServer()

async function capture(request: Request) {
  captured.push({
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: await request.text(),
  })
}

function onRepo(resolver: () => Response | Promise<Response>) {
  server.use(
    http.post(REPO_URL, async ({ request }) => {
      await capture(request)
      return resolver()
    })
  )
}

function makeConfig(
  // null means "no providerConfig at all"; undefined picks the default repository config
  providerConfig: Record<string, unknown> | string | null = { repositoryId: 'my repo' },
  overrides: Partial<BackendConfig> = {}
): BackendConfig {
  return {
    id: 'b1',
    name: 'GraphDB',
    type: 'graphdb',
    endpoint: `${BASE}/`,
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    providerConfig:
      providerConfig === null
        ? undefined
        : typeof providerConfig === 'string'
          ? providerConfig
          : JSON.stringify(providerConfig),
    ...overrides,
  }
}

const basicCreds: BackendCredentials = { backendId: 'b1', username: 'admin', password: 'root' }
const basicHeader = `Basic ${Buffer.from('admin:root').toString('base64')}`
const selectResult = { head: { vars: [] }, results: { bindings: [] } }
const SELECT = 'SELECT * WHERE { ?s ?p ?o }'

describe('GraphDBProvider', () => {
  const provider = new GraphDBProvider()

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    captured.length = 0
    GraphDBProvider.clearTokenCache()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    server.resetHandlers()
    vi.restoreAllMocks()
  })

  describe('execute - request shape', () => {
    it('POSTs to the repository endpoint with SPARQL headers', async () => {
      onRepo(() =>
        HttpResponse.json(selectResult, {
          headers: { 'Content-Type': 'application/sparql-results+json' },
        })
      )

      const result = await provider.execute(makeConfig(), SELECT)

      expect(result).toEqual({
        data: selectResult,
        queryType: 'SELECT',
        contentType: 'application/sparql-results+json',
      })
      expect(captured).toHaveLength(1)
      const req = captured[0]
      expect(req.url.pathname).toBe('/repositories/my%20repo')
      expect(req.url.search).toBe('')
      expect(req.body).toBe(SELECT)
      expect(req.headers.get('content-type')).toBe('application/sparql-query')
      expect(req.headers.get('accept')).toBe('application/sparql-results+json, application/json')
      expect(req.headers.get('authorization')).toBeNull()
    })

    it('detects ASK queries', async () => {
      onRepo(() => HttpResponse.json({ boolean: false }))
      const result = await provider.execute(makeConfig(), 'ASK { ?s ?p ?o }')
      expect(result.queryType).toBe('ASK')
      expect(result.data).toEqual({ boolean: false })
    })

    it.each([
      ['CONSTRUCT', 'CONSTRUCT WHERE { ?s ?p ?o }'],
      ['DESCRIBE', 'DESCRIBE <http://ex/a>'],
    ])('requests Turtle text for %s', async (type, query) => {
      onRepo(
        () => new HttpResponse('<a> <b> <c> .', { headers: { 'Content-Type': 'text/turtle' } })
      )
      const result = await provider.execute(makeConfig(), query)
      expect(result).toEqual({ data: '<a> <b> <c> .', queryType: type, contentType: 'text/turtle' })
      expect(captured[0].headers.get('accept')).toBe('text/turtle')
    })

    it('treats UPDATE and unparseable queries as SELECT', async () => {
      onRepo(() => new HttpResponse(null, { status: 204 }))
      const update = await provider.execute(makeConfig(), 'DELETE WHERE { ?s ?p ?o }')
      const garbage = await provider.execute(makeConfig(), 'garbage')
      expect(update.queryType).toBe('SELECT')
      expect(garbage.queryType).toBe('SELECT')
      expect(captured.map((r) => r.body)).toEqual(['DELETE WHERE { ?s ?p ?o }', 'garbage'])
    })

    it('adds infer, sameAs and timeout parameters from provider config', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(
        makeConfig({ repositoryId: 'my repo', inferenceEnabled: false, sameAs: false, timeout: 5 }),
        SELECT
      )
      const params = captured[0].url.searchParams
      expect(params.get('infer')).toBe('false')
      expect(params.get('sameAs')).toBe('false')
      expect(params.get('timeout')).toBe('5')
    })

    it('omits infer/sameAs parameters when they are enabled', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(
        makeConfig({ repositoryId: 'my repo', inferenceEnabled: true, sameAs: true }),
        SELECT
      )
      expect(captured[0].url.search).toBe('')
    })

    it('rejects queries over 100KB', async () => {
      await expect(provider.execute(makeConfig(), 'x'.repeat(100001))).rejects.toThrow(
        'Query too large (max 100KB)'
      )
      expect(captured).toHaveLength(0)
    })

    it('rejects malformed provider config JSON', async () => {
      await expect(provider.execute(makeConfig('{not json'), SELECT)).rejects.toThrow(
        'Invalid GraphDB configuration'
      )
    })

    it.each([[null], [{}], [{ repositoryId: '' }]])(
      'rejects a config without a repository (%j)',
      async (cfg) => {
        await expect(provider.execute(makeConfig(cfg), SELECT)).rejects.toThrow(
          'No repository selected'
        )
      }
    )
  })

  describe('execute - authentication', () => {
    it('uses a bearer token with GDB prefix', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'bearer' }), SELECT, {
        backendId: 'b1',
        token: 'abc',
      })
      expect(captured[0].headers.get('authorization')).toBe('GDB abc')
    })

    it('does not double-prefix a GDB token', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'bearer' }), SELECT, {
        backendId: 'b1',
        token: 'GDB abc',
      })
      expect(captured[0].headers.get('authorization')).toBe('GDB abc')
    })

    it('logs in via /rest/login, uses the returned token and caches it', async () => {
      const logins: CapturedRequest[] = []
      server.use(
        http.post(`${BASE}/rest/login`, async ({ request }) => {
          logins.push({
            method: request.method,
            url: new URL(request.url),
            headers: request.headers,
            body: await request.text(),
          })
          return new HttpResponse(null, { headers: { Authorization: 'GDB token-v10' } })
        })
      )
      onRepo(() => HttpResponse.json(selectResult))
      const config = makeConfig(undefined, { authType: 'basic' })

      await provider.execute(config, SELECT, basicCreds)
      await provider.execute(config, SELECT, basicCreds)

      expect(logins).toHaveLength(1)
      expect(JSON.parse(logins[0].body)).toEqual({ username: 'admin', password: 'root' })
      expect(logins[0].headers.get('content-type')).toBe('application/json')
      expect(captured.map((r) => r.headers.get('authorization'))).toEqual([
        'GDB token-v10',
        'GDB token-v10',
      ])
    })

    it('falls back to the v9 /rest/login/{username} endpoint', async () => {
      let v9Password: string | null = null
      server.use(
        http.post(`${BASE}/rest/login`, () => new HttpResponse(null, { status: 404 })),
        http.post(`${BASE}/rest/login/admin`, ({ request }) => {
          v9Password = request.headers.get('x-graphdb-password')
          return new HttpResponse(null, { headers: { Authorization: 'GDB token-v9' } })
        })
      )
      onRepo(() => HttpResponse.json(selectResult))

      await provider.execute(makeConfig(undefined, { authType: 'basic' }), SELECT, basicCreds)

      expect(v9Password).toBe('root')
      expect(captured[0].headers.get('authorization')).toBe('GDB token-v9')
    })

    it('tries v9 login when /rest/login returns no token header', async () => {
      const v9 = vi.fn(() => new HttpResponse(null, { headers: { Authorization: 'GDB t9' } }))
      server.use(
        http.post(`${BASE}/rest/login`, () => new HttpResponse(null, { status: 200 })),
        http.post(`${BASE}/rest/login/admin`, v9)
      )
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'basic' }), SELECT, basicCreds)
      expect(v9).toHaveBeenCalledTimes(1)
      expect(captured[0].headers.get('authorization')).toBe('GDB t9')
    })

    it.each([
      ['v9 login rejects credentials', 401],
      ['v9 login errors', 500],
      ['no token is returned', 200],
    ])('falls back to Basic auth when %s', async (_name, v9Status) => {
      server.use(
        http.post(`${BASE}/rest/login`, () => new HttpResponse(null, { status: 404 })),
        http.post(`${BASE}/rest/login/admin`, () => new HttpResponse(null, { status: v9Status }))
      )
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'basic' }), SELECT, basicCreds)
      expect(captured[0].headers.get('authorization')).toBe(basicHeader)
    })

    it('falls back to Basic auth when the login server is unreachable', async () => {
      server.use(
        http.post(`${BASE}/rest/login`, () => HttpResponse.error()),
        http.post(`${BASE}/rest/login/admin`, () => HttpResponse.error())
      )
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'basic' }), SELECT, basicCreds)
      expect(captured[0].headers.get('authorization')).toBe(basicHeader)
    })

    it('uses custom headers via the base implementation', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'custom' }), SELECT, {
        backendId: 'b1',
        headers: { 'X-Key': 'v' },
      })
      expect(captured[0].headers.get('x-key')).toBe('v')
    })

    it('does not attempt login for basic auth without a password', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'basic' }), SELECT, {
        backendId: 'b1',
        username: 'admin',
      })
      expect(captured[0].headers.get('authorization')).toBeNull()
    })

    it('clears the cached token after a 401 so the next query logs in again', async () => {
      let loginCount = 0
      server.use(
        http.post(`${BASE}/rest/login`, () => {
          loginCount++
          return new HttpResponse(null, { headers: { Authorization: `GDB t${loginCount}` } })
        })
      )
      let calls = 0
      onRepo(() =>
        ++calls === 2 ? new HttpResponse(null, { status: 401 }) : HttpResponse.json(selectResult)
      )
      const config = makeConfig(undefined, { authType: 'basic' })

      await provider.execute(config, SELECT, basicCreds)
      await expect(provider.execute(config, SELECT, basicCreds)).rejects.toThrow(
        'Authentication failed (401): Please check your credentials or re-authenticate'
      )
      await provider.execute(config, SELECT, basicCreds)

      expect(loginCount).toBe(2)
      expect(captured.map((r) => r.headers.get('authorization'))).toEqual([
        'GDB t1',
        'GDB t1',
        'GDB t2',
      ])
    })

    it('clearTokenCache(endpoint, username) removes only that entry', async () => {
      let loginCount = 0
      server.use(
        http.post(`${BASE}/rest/login`, () => {
          loginCount++
          return new HttpResponse(null, { headers: { Authorization: `GDB t${loginCount}` } })
        })
      )
      onRepo(() => HttpResponse.json(selectResult))
      const config = makeConfig(undefined, { authType: 'basic' })

      await provider.execute(config, SELECT, basicCreds)
      GraphDBProvider.clearTokenCache(config.endpoint, 'someone-else')
      await provider.execute(config, SELECT, basicCreds)
      expect(loginCount).toBe(1)

      GraphDBProvider.clearTokenCache(config.endpoint, 'admin')
      await provider.execute(config, SELECT, basicCreds)
      expect(loginCount).toBe(2)
    })
  })

  describe('execute - errors', () => {
    it('maps 403 to an authentication error', async () => {
      onRepo(() => new HttpResponse('Forbidden', { status: 403 }))
      await expect(provider.execute(makeConfig(), SELECT)).rejects.toThrow(
        'Authentication failed (403)'
      )
    })

    it('maps 404 using the message field', async () => {
      onRepo(() => HttpResponse.json({ message: 'Unknown repository' }, { status: 404 }))
      await expect(provider.execute(makeConfig(), SELECT)).rejects.toThrow(
        'SPARQL query failed (404): Unknown repository'
      )
    })

    it('maps 500 using a plain-text body', async () => {
      onRepo(
        () =>
          new HttpResponse('MALFORMED QUERY', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          })
      )
      await expect(provider.execute(makeConfig(), SELECT)).rejects.toThrow(
        'SPARQL query failed (500): MALFORMED QUERY'
      )
    })

    it('maps network errors', async () => {
      onRepo(() => HttpResponse.error())
      await expect(provider.execute(makeConfig(), SELECT)).rejects.toThrow(
        /^SPARQL query failed \(network error\)/
      )
    })

    it('applies the configured timeout (seconds)', async () => {
      onRepo(async () => {
        await delay(500)
        return HttpResponse.json(selectResult)
      })
      await expect(
        provider.execute(makeConfig({ repositoryId: 'my repo', timeout: 0.02 }), SELECT)
      ).rejects.toThrow(/network error\): timeout of 20ms exceeded/)
    })

    it.each([
      [new Error('keychain locked'), 'Query execution failed: keychain locked'],
      ['weird', 'Query execution failed: Unknown error'],
    ])('wraps non-HTTP failure %s', async (thrown, message) => {
      const creds = {
        backendId: 'b1',
        get token(): string {
          throw thrown
        },
      }
      await expect(
        provider.execute(makeConfig(undefined, { authType: 'bearer' }), SELECT, creds)
      ).rejects.toThrow(message)
    })
  })

  describe('validate', () => {
    it('rejects an invalid URL', async () => {
      await expect(provider.validate(makeConfig(undefined, { endpoint: 'nope' }))).resolves.toEqual(
        {
          valid: false,
          error: 'Invalid endpoint URL',
        }
      )
    })

    it('rejects malformed provider config', async () => {
      await expect(provider.validate(makeConfig('{'))).resolves.toEqual({
        valid: false,
        error: 'Invalid provider configuration',
      })
    })

    it('rejects a missing repository', async () => {
      await expect(provider.validate(makeConfig(null))).resolves.toEqual({
        valid: false,
        error: 'No repository selected',
      })
    })

    it('sends a test query to the repository endpoint', async () => {
      onRepo(() => HttpResponse.json(selectResult))
      await expect(
        provider.validate(makeConfig(undefined, { authType: 'bearer' }), {
          backendId: 'b1',
          token: 't',
        })
      ).resolves.toEqual({ valid: true })
      expect(captured[0].body).toContain('SELECT (COUNT(?s) as ?subjects)')
      expect(captured[0].headers.get('authorization')).toBe('GDB t')
    })

    it('reports an unexpected status code', async () => {
      onRepo(() => HttpResponse.json(selectResult, { status: 203 }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: 'Unexpected status code: 203',
      })
    })

    it.each([401, 403, 404, 500])('reports HTTP %i', async (status) => {
      onRepo(() => HttpResponse.json({ message: 'bad' }, { status }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: `Connection failed (${status}): bad`,
      })
    })

    it('reports network errors', async () => {
      onRepo(() => HttpResponse.error())
      const result = await provider.validate(makeConfig())
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/^Connection failed \(network error\)/)
    })

    it.each([
      [new Error('boom'), 'Connection failed: boom'],
      [42, 'Connection failed: Unknown error'],
    ])('reports non-HTTP failure %s', async (thrown, error) => {
      const creds = {
        backendId: 'b1',
        get token(): string {
          throw thrown
        },
      }
      await expect(
        provider.validate(makeConfig(undefined, { authType: 'bearer' }), creds)
      ).resolves.toEqual({ valid: false, error })
    })
  })

  describe('buildEndpointUrl', () => {
    // Exposed via a subclass because the method is protected
    class Exposed extends GraphDBProvider {
      url(config: BackendConfig) {
        return this.buildEndpointUrl(config)
      }
    }
    const exposed = new Exposed()

    it('strips trailing slashes and encodes the repository id', () => {
      expect(
        exposed.url(makeConfig({ repositoryId: 'a/b' }, { endpoint: 'http://h:7200///' }))
      ).toBe('http://h:7200/repositories/a%2Fb')
    })

    it.each([['{bad'], [null], [JSON.stringify({})]])(
      'returns the raw endpoint for config %s',
      (cfg) => {
        expect(exposed.url(makeConfig(cfg, { endpoint: 'http://h/' }))).toBe('http://h/')
      }
    )
  })
})
