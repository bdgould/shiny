import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import type { AxiosInstance } from 'axios'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { MobiProvider } from '../MobiProvider'
import { MOBI_RECORD_TYPE_IRIS } from '../mobi-types'
import type { BackendConfig, BackendCredentials } from '../../types'

const HOST = 'http://mobi.test'
const RECORD = 'https://mobi.com/records#abc'
const RECORD_ENC = encodeURIComponent(RECORD)
const REPO = 'system'

interface CapturedRequest {
  method: string
  url: URL
  headers: Headers
  body: string
}

const captured: CapturedRequest[] = []
const logins: CapturedRequest[] = []
const server = setupServer()

async function toCaptured(request: Request): Promise<CapturedRequest> {
  return {
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: await request.text(),
  }
}

// Each test uses its own tenant path so the module-level session cache never leaks between tests
let tenantCounter = 0
let endpoint = ''

type Resolver = (req: CapturedRequest) => Response | Promise<Response>

function onSparql(resolver: Resolver) {
  server.use(
    http.post(`${HOST}/:tenant/mobirest/sparql/*`, async ({ request }) => {
      const req = await toCaptured(request)
      captured.push(req)
      return resolver(req)
    })
  )
}

function onLogin(
  resolver: Resolver = () => new HttpResponse(null, { headers: { 'X-Set-Session': 'tok1' } })
) {
  server.use(
    http.post(`${HOST}/:tenant/mobirest/session`, async ({ request }) => {
      const req = await toCaptured(request)
      logins.push(req)
      return resolver(req)
    })
  )
}

function makeConfig(
  providerConfig: Record<string, unknown> | string | null = { recordId: RECORD },
  overrides: Partial<BackendConfig> = {}
): BackendConfig {
  return {
    id: 'b1',
    name: 'Mobi',
    type: 'mobi',
    endpoint,
    authType: 'basic',
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

const creds: BackendCredentials = { backendId: 'b1', username: 'admin', password: 'admin' }
const selectResult = { head: { vars: [] }, results: { bindings: [] } }
const SELECT = 'SELECT * WHERE { ?s ?p ?o }'

/**
 * MobiProvider loads its ESM-only cookie-jar dependencies (axios-cookiejar-support,
 * tough-cookie) through `new Function('specifier', 'return import(specifier)')`, which
 * Vitest's module runner cannot service. The real cookie agent also operates below the
 * layer msw intercepts, so it never sees mocked Set-Cookie headers. While the suite runs
 * we therefore route exactly that construct to fake modules: a minimal jar that stores the
 * session token from an `X-Set-Session` response header and replays it as `X-Session`.
 * Using a custom header (instead of Set-Cookie) keeps msw's own cookie store out of the way.
 * Every other use of the Function constructor is passed through untouched.
 */
class FakeCookieJar {
  token?: string
}

function fakeWrapper(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.request.use((cfg) => {
    const jar = (instance.defaults as { jar?: FakeCookieJar }).jar
    if (jar?.token) cfg.headers.set('X-Session', jar.token)
    return cfg
  })
  instance.interceptors.response.use((res) => {
    const jar = (instance.defaults as { jar?: FakeCookieJar }).jar
    const token = res.headers['x-set-session']
    if (jar && typeof token === 'string') jar.token = token
    return res
  })
  return instance
}

const fakeModules: Record<string, unknown> = {
  'axios-cookiejar-support': { wrapper: fakeWrapper },
  'tough-cookie': { CookieJar: FakeCookieJar },
}

const OriginalFunction = globalThis.Function
const dynamicImportShim: FunctionConstructor = new Proxy(OriginalFunction, {
  construct(target, args): object {
    if (args.length === 2 && args[0] === 'specifier' && args[1] === 'return import(specifier)') {
      return async (specifier: string) => {
        if (!(specifier in fakeModules)) throw new Error(`Unexpected import: ${specifier}`)
        return fakeModules[specifier]
      }
    }
    return Reflect.construct(target, args)
  },
})

describe('MobiProvider', () => {
  const provider = new MobiProvider()

  beforeAll(() => {
    globalThis.Function = dynamicImportShim
    server.listen({ onUnhandledRequest: 'error' })
  })
  afterAll(() => {
    globalThis.Function = OriginalFunction
    server.close()
  })
  beforeEach(() => {
    captured.length = 0
    logins.length = 0
    endpoint = `${HOST}/t${++tenantCounter}`
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    server.resetHandlers()
    vi.restoreAllMocks()
  })

  describe('execute', () => {
    it('logs in with form credentials and sends the session cookie with the query', async () => {
      onLogin()
      onSparql(() =>
        HttpResponse.json(selectResult, {
          headers: { 'Content-Type': 'application/sparql-results+json' },
        })
      )

      const result = await provider.execute(makeConfig(), SELECT, creds)

      expect(result).toEqual({
        data: selectResult,
        queryType: 'SELECT',
        contentType: 'application/sparql-results+json',
      })
      expect(logins).toHaveLength(1)
      expect(logins[0].headers.get('content-type')).toBe('application/x-www-form-urlencoded')
      expect(Object.fromEntries(new URLSearchParams(logins[0].body))).toEqual({
        username: 'admin',
        password: 'admin',
      })
      const req = captured[0]
      expect(req.url.pathname).toBe(`/t${tenantCounter}/mobirest/sparql/repository/${RECORD_ENC}`)
      expect(req.body).toBe(SELECT)
      expect(req.headers.get('content-type')).toBe('application/sparql-query')
      expect(req.headers.get('accept')).toBe('application/sparql-results+json, application/json')
      expect(req.headers.get('x-session')).toBe('tok1')
    })

    it('reuses the cached session for subsequent queries', async () => {
      onLogin()
      onSparql(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(), SELECT, creds)
      await provider.execute(makeConfig(), SELECT, creds)
      expect(logins).toHaveLength(1)
      expect(captured).toHaveLength(2)
    })

    it('queries anonymously without logging in when no credentials are given', async () => {
      onLogin()
      onSparql(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType: 'none' }), SELECT)
      expect(logins).toHaveLength(0)
      expect(captured[0].headers.get('x-session')).toBeNull()
    })

    it('detects ASK queries', async () => {
      onLogin()
      onSparql(() => HttpResponse.json({ boolean: true }))
      const result = await provider.execute(makeConfig(), 'ASK { ?s ?p ?o }', creds)
      expect(result.queryType).toBe('ASK')
      expect(result.data).toEqual({ boolean: true })
    })

    it.each([
      ['CONSTRUCT', 'CONSTRUCT WHERE { ?s ?p ?o }'],
      ['DESCRIBE', 'DESCRIBE <http://ex/a>'],
    ])('requests Turtle text for %s', async (type, query) => {
      onLogin()
      onSparql(
        () => new HttpResponse('<a> <b> <c> .', { headers: { 'Content-Type': 'text/turtle' } })
      )
      const result = await provider.execute(makeConfig(), query, creds)
      expect(result).toEqual({ data: '<a> <b> <c> .', queryType: type, contentType: 'text/turtle' })
      expect(captured[0].headers.get('accept')).toBe('text/turtle')
    })

    it('treats UPDATE and unparseable queries as SELECT', async () => {
      onLogin()
      onSparql(() => HttpResponse.json({}))
      expect((await provider.execute(makeConfig(), 'DROP ALL', creds)).queryType).toBe('SELECT')
      expect((await provider.execute(makeConfig(), 'nonsense', creds)).queryType).toBe('SELECT')
    })

    it.each([
      [
        { recordId: RECORD, recordType: MOBI_RECORD_TYPE_IRIS['ontology-record'] },
        `ontology-record/${RECORD_ENC}`,
        '',
      ],
      [
        { recordId: RECORD, recordType: MOBI_RECORD_TYPE_IRIS['dataset-record'] },
        `dataset-record/${RECORD_ENC}`,
        '',
      ],
      [
        { recordId: RECORD, recordType: MOBI_RECORD_TYPE_IRIS['shapes-graph-record'] },
        `shapes-graph-record/${RECORD_ENC}`,
        '',
      ],
      [
        { recordId: RECORD, recordType: 'http://other', storeType: 'custom' },
        `custom/${RECORD_ENC}`,
        '',
      ],
      [
        { recordId: RECORD, branchId: 'urn:branch/1', includeImports: true },
        `repository/${RECORD_ENC}`,
        '?branchId=urn%3Abranch%2F1&includeImports=true',
      ],
      [{ queryMode: 'repository', repositoryId: REPO }, `repository/${REPO}`, ''],
      [
        { queryMode: 'repository', repositoryId: 'urn:repo', branchId: 'b', includeImports: true },
        'repository/urn%3Arepo',
        '?branchId=b&includeImports=true',
      ],
    ])('builds the endpoint for config %j', async (cfg, pathSuffix, search) => {
      onLogin()
      onSparql(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(cfg), SELECT, creds)
      expect(captured[0].url.pathname).toBe(`/t${tenantCounter}/mobirest/sparql/${pathSuffix}`)
      expect(captured[0].url.search).toBe(search)
    })

    it('rejects queries over 100KB', async () => {
      await expect(provider.execute(makeConfig(), 'x'.repeat(100001), creds)).rejects.toThrow(
        'Query too large (max 100KB)'
      )
    })

    it('rejects malformed provider config JSON', async () => {
      await expect(provider.execute(makeConfig('{'), SELECT, creds)).rejects.toThrow(
        'Invalid Mobi configuration'
      )
    })

    it('rejects a missing provider config', async () => {
      await expect(provider.execute(makeConfig(null), SELECT, creds)).rejects.toThrow(
        'No Mobi configuration found'
      )
    })

    it('rejects repository mode without a repository', async () => {
      await expect(
        provider.execute(makeConfig({ queryMode: 'repository' }), SELECT, creds)
      ).rejects.toThrow('No repository selected')
    })

    it('rejects record mode without a record', async () => {
      await expect(
        provider.execute(makeConfig({ queryMode: 'record' }), SELECT, creds)
      ).rejects.toThrow('No record selected')
      expect(logins).toHaveLength(0)
    })

    it('reports invalid login credentials', async () => {
      onLogin(() => new HttpResponse(null, { status: 401 }))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'Query execution failed: Authentication failed: Invalid username or password'
      )
      expect(captured).toHaveLength(0)
    })

    it('reports other login failures with the server message', async () => {
      onLogin(() => HttpResponse.json({ message: 'LDAP down' }, { status: 500 }))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'Authentication failed: LDAP down'
      )
    })

    it('does not cache a failed login', async () => {
      let attempt = 0
      onLogin(() =>
        ++attempt === 1
          ? new HttpResponse(null, { status: 503 })
          : new HttpResponse(null, { headers: { 'X-Set-Session': 'ok' } })
      )
      onSparql(() => HttpResponse.json(selectResult))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'Authentication failed'
      )
      await expect(provider.execute(makeConfig(), SELECT, creds)).resolves.toMatchObject({
        queryType: 'SELECT',
      })
      expect(logins).toHaveLength(2)
    })

    it('re-authenticates once and retries the query on 401', async () => {
      let loginCount = 0
      onLogin(() => {
        loginCount++
        return new HttpResponse(null, {
          headers: { 'X-Set-Session': `tok${loginCount}` },
        })
      })
      onSparql((req) =>
        req.headers.get('x-session') === 'tok2'
          ? HttpResponse.json(selectResult)
          : new HttpResponse(null, { status: 401 })
      )

      const result = await provider.execute(makeConfig(), SELECT, creds)

      expect(result).toEqual({
        data: selectResult,
        queryType: 'SELECT',
        contentType: 'application/json',
      })
      expect(logins).toHaveLength(2)
      expect(captured).toHaveLength(2)
      expect(captured[1].body).toBe(SELECT)
    })

    it('reports failure when the retry after re-authentication also fails', async () => {
      onLogin()
      onSparql(() => HttpResponse.json({ message: 'still no' }, { status: 401 }))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'SPARQL query failed after re-authentication: still no'
      )
      expect(captured).toHaveLength(2)
    })

    it('reports failure when re-authentication itself fails', async () => {
      let loginCount = 0
      onLogin(() =>
        ++loginCount === 1
          ? new HttpResponse(null, { headers: { 'X-Set-Session': 'a' } })
          : new HttpResponse(null, { status: 401 })
      )
      onSparql(() => new HttpResponse(null, { status: 401 }))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'SPARQL query failed after re-authentication'
      )
    })

    it.each([403, 404, 500])('maps HTTP %i errors', async (status) => {
      onLogin()
      onSparql(() => HttpResponse.json({ message: 'nope' }, { status }))
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        `SPARQL query failed (${status}): nope`
      )
    })

    it('uses a plain-text error body when there is no message field', async () => {
      onLogin()
      onSparql(
        () =>
          new HttpResponse('Record not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          })
      )
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        'SPARQL query failed (404): Record not found'
      )
    })

    it('maps network errors', async () => {
      onLogin()
      onSparql(() => HttpResponse.error())
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        /^SPARQL query failed \(network error\)/
      )
    })

    it('maps network errors during login', async () => {
      onLogin(() => HttpResponse.error())
      await expect(provider.execute(makeConfig(), SELECT, creds)).rejects.toThrow(
        /Authentication failed: /
      )
    })

    it('warns that allowInsecure is not honoured', async () => {
      onSparql(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { allowInsecure: true }), SELECT)
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('allowInsecure'))
    })
  })

  describe('validate', () => {
    it('rejects invalid URLs', async () => {
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

    it('rejects a missing provider config', async () => {
      await expect(provider.validate(makeConfig(null))).resolves.toEqual({
        valid: false,
        error: 'No Mobi configuration found',
      })
    })

    it('rejects repository mode without a repository', async () => {
      await expect(provider.validate(makeConfig({ queryMode: 'repository' }))).resolves.toEqual({
        valid: false,
        error: 'No repository selected',
      })
    })

    it('rejects record mode without a record', async () => {
      await expect(provider.validate(makeConfig({}))).resolves.toEqual({
        valid: false,
        error: 'No record selected',
      })
    })

    it('logs in and sends a test query', async () => {
      onLogin()
      onSparql(() => HttpResponse.json(selectResult))
      await expect(
        provider.validate(makeConfig({ queryMode: 'repository', repositoryId: REPO }), creds)
      ).resolves.toEqual({ valid: true })
      expect(logins).toHaveLength(1)
      expect(captured[0].url.pathname).toBe(`/t${tenantCounter}/mobirest/sparql/repository/${REPO}`)
      expect(captured[0].body).toContain('SELECT (COUNT(?s) as ?subjects)')
      expect(captured[0].headers.get('x-session')).toBe('tok1')
    })

    it('reports an unexpected status code', async () => {
      onLogin()
      onSparql(() => HttpResponse.json(selectResult, { status: 202 }))
      await expect(provider.validate(makeConfig(), creds)).resolves.toEqual({
        valid: false,
        error: 'Unexpected status code: 202',
      })
    })

    it.each([401, 403, 404, 500])('reports HTTP %i', async (status) => {
      onLogin()
      onSparql(() => HttpResponse.json({ message: 'bad' }, { status }))
      await expect(provider.validate(makeConfig(), creds)).resolves.toEqual({
        valid: false,
        error: `Connection failed (${status}): bad`,
      })
    })

    it('reports login failures', async () => {
      onLogin(() => new HttpResponse(null, { status: 401 }))
      await expect(provider.validate(makeConfig(), creds)).resolves.toEqual({
        valid: false,
        error: 'Connection failed: Authentication failed: Invalid username or password',
      })
    })

    it('reports network errors', async () => {
      onSparql(() => HttpResponse.error())
      const r = await provider.validate(makeConfig())
      expect(r.valid).toBe(false)
      expect(r.error).toMatch(/^Connection failed \(network error\)/)
    })
  })

  describe('buildEndpointUrl', () => {
    class Exposed extends MobiProvider {
      url(config: BackendConfig) {
        return this.buildEndpointUrl(config)
      }
    }
    const exposed = new Exposed()

    it('strips trailing slashes from the endpoint', () => {
      const url = exposed.url(makeConfig(undefined, { endpoint: 'http://mobi.test/' }))
      expect(url.startsWith('http://mobi.test/mobirest/sparql/')).toBe(true)
    })

    it.each([
      ['{bad'],
      [null],
      [JSON.stringify({ queryMode: 'repository' })],
      [JSON.stringify({ queryMode: 'record' })],
    ])('falls back to the base SPARQL endpoint for config %s', (cfg) => {
      expect(exposed.url(makeConfig(cfg))).toBe(`${endpoint}/mobirest/sparql`)
    })
  })
})
