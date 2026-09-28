import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { http, HttpResponse, delay } from 'msw'
import { setupServer } from 'msw/node'
import { GraphStudioProvider } from '../GraphStudioProvider'
import type { BackendConfig, BackendCredentials } from '../../types'

const BASE = 'http://anzo.test'
const GRAPHMART = 'http://cambridgesemantics.com/Graphmart/abc'
// encodeURIComponent with uppercase hex digits
const GM_PATH = `/sparql/graphmart/http%3A%2F%2Fcambridgesemantics.com%2FGraphmart%2Fabc`
const GM_URL = `${BASE}${GM_PATH}`

interface CapturedRequest {
  method: string
  url: URL
  headers: Headers
  body: string
}

const captured: CapturedRequest[] = []
const server = setupServer()

function onGraphmart(resolver: () => Response | Promise<Response>) {
  server.use(
    http.post(GM_URL, async ({ request }) => {
      captured.push({
        method: request.method,
        url: new URL(request.url),
        headers: request.headers,
        body: await request.text(),
      })
      return resolver()
    })
  )
}

function makeConfig(
  providerConfig: Record<string, unknown> | string | null = {
    graphmartUri: GRAPHMART,
    graphmartName: 'GM',
    selectedLayers: [],
  },
  overrides: Partial<BackendConfig> = {}
): BackendConfig {
  return {
    id: 'b1',
    name: 'GraphStudio',
    type: 'graphstudio',
    endpoint: BASE,
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

const selectResult = { head: { vars: [] }, results: { bindings: [] } }
const SELECT = 'SELECT * WHERE { ?s ?p ?o }'

describe('GraphStudioProvider', () => {
  const provider = new GraphStudioProvider()

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    captured.length = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    server.resetHandlers()
    vi.restoreAllMocks()
  })

  describe('execute', () => {
    it('sends a direct SPARQL request to the graphmart endpoint when no layers are selected', async () => {
      onGraphmart(() =>
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
      const req = captured[0]
      expect(req.url.pathname).toBe(GM_PATH)
      expect(req.body).toBe(SELECT)
      expect(req.headers.get('content-type')).toBe('application/sparql-query')
      expect(req.headers.get('accept')).toBe('application/sparql-results+json, application/json')
    })

    it.each([[['ALL_LAYERS']], [undefined], ['not-an-array']])(
      'queries all layers when selectedLayers is %j',
      async (selectedLayers) => {
        onGraphmart(() => HttpResponse.json(selectResult))
        await provider.execute(makeConfig({ graphmartUri: GRAPHMART, selectedLayers }), SELECT)
        expect(captured[0].headers.get('content-type')).toBe('application/sparql-query')
        expect(captured[0].body).toBe(SELECT)
      }
    )

    it('sends a form-encoded request with one default-graph-uri per selected layer', async () => {
      onGraphmart(() => HttpResponse.json(selectResult))
      const layers = ['http://ex/layer/1', 'http://ex/layer/2']

      await provider.execute(
        makeConfig({ graphmartUri: GRAPHMART, selectedLayers: layers }),
        SELECT
      )

      const req = captured[0]
      expect(req.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
      const form = new URLSearchParams(req.body)
      expect(form.get('query')).toBe(SELECT)
      expect(form.getAll('default-graph-uri')).toEqual(layers)
    })

    it('detects ASK queries', async () => {
      onGraphmart(() => HttpResponse.json({ boolean: true }))
      const result = await provider.execute(makeConfig(), 'ASK { ?s ?p ?o }')
      expect(result.queryType).toBe('ASK')
    })

    it.each([
      ['CONSTRUCT', 'CONSTRUCT WHERE { ?s ?p ?o }'],
      ['DESCRIBE', 'DESCRIBE <http://ex/a>'],
    ])('requests Turtle text for %s', async (type, query) => {
      onGraphmart(
        () => new HttpResponse('<a> <b> <c> .', { headers: { 'Content-Type': 'text/turtle' } })
      )
      const result = await provider.execute(makeConfig(), query)
      expect(result).toEqual({ data: '<a> <b> <c> .', queryType: type, contentType: 'text/turtle' })
      expect(captured[0].headers.get('accept')).toBe('text/turtle')
    })

    it('requests Turtle text for CONSTRUCT with layer filtering', async () => {
      onGraphmart(
        () => new HttpResponse('<a> <b> <c> .', { headers: { 'Content-Type': 'text/turtle' } })
      )
      const result = await provider.execute(
        makeConfig({ graphmartUri: GRAPHMART, selectedLayers: ['http://ex/l'] }),
        'CONSTRUCT WHERE { ?s ?p ?o }'
      )
      expect(result.data).toBe('<a> <b> <c> .')
      expect(captured[0].headers.get('accept')).toBe('text/turtle')
    })

    it('treats UPDATE and unparseable queries as SELECT', async () => {
      onGraphmart(() => new HttpResponse(null, { status: 204 }))
      expect((await provider.execute(makeConfig(), 'CLEAR ALL')).queryType).toBe('SELECT')
      expect((await provider.execute(makeConfig(), '???')).queryType).toBe('SELECT')
    })

    it.each<[string, BackendConfig['authType'], BackendCredentials, string, string]>([
      [
        'basic',
        'basic',
        { backendId: 'b1', username: 'u', password: 'p' },
        'authorization',
        `Basic ${Buffer.from('u:p').toString('base64')}`,
      ],
      ['bearer', 'bearer', { backendId: 'b1', token: 't' }, 'authorization', 'Bearer t'],
      ['custom', 'custom', { backendId: 'b1', headers: { 'X-K': 'v' } }, 'x-k', 'v'],
    ])('sends %s auth headers', async (_n, authType, creds, header, value) => {
      onGraphmart(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(undefined, { authType }), SELECT, creds)
      expect(captured[0].headers.get(header)).toBe(value)
    })

    it('sends auth headers on layer-filtered requests too', async () => {
      onGraphmart(() => HttpResponse.json(selectResult))
      await provider.execute(
        makeConfig(
          { graphmartUri: GRAPHMART, selectedLayers: ['http://ex/l'] },
          { authType: 'bearer' }
        ),
        SELECT,
        { backendId: 'b1', token: 't' }
      )
      expect(captured[0].headers.get('authorization')).toBe('Bearer t')
    })

    it('rejects queries over 100KB', async () => {
      await expect(provider.execute(makeConfig(), 'x'.repeat(100001))).rejects.toThrow(
        'Query too large (max 100KB)'
      )
    })

    it('rejects malformed provider config JSON', async () => {
      await expect(provider.execute(makeConfig('{oops'), SELECT)).rejects.toThrow(
        'Invalid GraphStudio configuration'
      )
    })

    it.each([[null], [{ graphmartName: 'x' }]])(
      'rejects config without a graphmart (%j)',
      async (cfg) => {
        await expect(provider.execute(makeConfig(cfg), SELECT)).rejects.toThrow(
          'No graphmart selected'
        )
        expect(captured).toHaveLength(0)
      }
    )

    it.each([401, 403, 404])(
      'maps HTTP %i with a JSON body into a detailed error',
      async (status) => {
        onGraphmart(() => HttpResponse.json({ message: 'denied', code: status }, { status }))
        const err = (await provider.execute(makeConfig(), SELECT).catch((e) => e)) as Error
        expect(err.message).toContain(`SPARQL query failed (${status}): denied`)
        expect(err.message).toContain('Server response:')
        expect(err.message).toContain(`"code": ${status}`)
      }
    )

    it('includes a plain-text server response in 500 errors', async () => {
      onGraphmart(
        () =>
          new HttpResponse('java.lang.NullPointerException', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
          })
      )
      const err = (await provider.execute(makeConfig(), SELECT).catch((e) => e)) as Error
      expect(err.message).toContain(
        'SPARQL query failed (500): Request failed with status code 500'
      )
      expect(err.message).toContain('Server response: java.lang.NullPointerException')
    })

    it('maps errors on layer-filtered requests', async () => {
      onGraphmart(() => new HttpResponse('bad layer', { status: 400 }))
      await expect(
        provider.execute(
          makeConfig({ graphmartUri: GRAPHMART, selectedLayers: ['http://ex/l'] }),
          SELECT
        )
      ).rejects.toThrow('SPARQL query failed (400)')
    })

    it('maps network errors', async () => {
      onGraphmart(() => HttpResponse.error())
      const err = (await provider.execute(makeConfig(), SELECT).catch((e) => e)) as Error
      expect(err.message).toMatch(/^SPARQL query failed \(network error\): /)
      expect(err.message).not.toContain('Server response')
    })

    it('maps timeouts', async () => {
      const id = axios.interceptors.request.use((cfg) => ({ ...cfg, timeout: 20 }))
      try {
        onGraphmart(async () => {
          await delay(500)
          return HttpResponse.json(selectResult)
        })
        await expect(provider.execute(makeConfig(), SELECT)).rejects.toThrow(
          /network error\): timeout of 20ms exceeded/
        )
      } finally {
        axios.interceptors.request.eject(id)
      }
    })

    it.each([
      [new Error('keychain locked'), 'Query execution failed: keychain locked'],
      [null, 'Query execution failed: Unknown error'],
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
    it('rejects invalid URLs', async () => {
      await expect(provider.validate(makeConfig(undefined, { endpoint: 'x' }))).resolves.toEqual({
        valid: false,
        error: 'Invalid endpoint URL',
      })
    })

    it('rejects malformed provider config', async () => {
      await expect(provider.validate(makeConfig('['))).resolves.toEqual({
        valid: false,
        error: 'Invalid provider configuration',
      })
    })

    it('rejects a missing graphmart', async () => {
      await expect(provider.validate(makeConfig(null))).resolves.toEqual({
        valid: false,
        error: 'No graphmart selected',
      })
    })

    it('sends a test query to the graphmart endpoint', async () => {
      onGraphmart(() => HttpResponse.json(selectResult))
      await expect(
        provider.validate(makeConfig(undefined, { authType: 'bearer' }), {
          backendId: 'b1',
          token: 't',
        })
      ).resolves.toEqual({ valid: true })
      expect(captured[0].body).toContain('SELECT (COUNT(?s) as ?subjects)')
      expect(captured[0].headers.get('authorization')).toBe('Bearer t')
    })

    it('reports an unexpected status code', async () => {
      onGraphmart(() => HttpResponse.json(selectResult, { status: 206 }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: 'Unexpected status code: 206',
      })
    })

    it.each([401, 403, 404, 500])('reports HTTP %i', async (status) => {
      onGraphmart(() => HttpResponse.json({ message: 'bad' }, { status }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: `Connection failed (${status}): bad`,
      })
    })

    it('reports network errors', async () => {
      onGraphmart(() => HttpResponse.error())
      const r = await provider.validate(makeConfig())
      expect(r.error).toMatch(/^Connection failed \(network error\)/)
    })

    it.each([
      [new Error('boom'), 'Connection failed: boom'],
      ['str', 'Connection failed: Unknown error'],
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
    class Exposed extends GraphStudioProvider {
      url(config: BackendConfig) {
        return this.buildEndpointUrl(config)
      }
    }
    const exposed = new Exposed()

    it('strips trailing slashes from the endpoint', () => {
      const url = exposed.url(makeConfig(undefined, { endpoint: `${BASE}//` }))
      expect(url.startsWith(`${BASE}/sparql/graphmart/`)).toBe(true)
    })

    it('encodes the graphmart URI with uppercase hex escapes', () => {
      expect(exposed.url(makeConfig({ graphmartUri: 'urn:a b/ü' }))).toBe(
        `${BASE}/sparql/graphmart/urn%3Aa%20b%2F%C3%BC`
      )
    })

    it.each([['{bad'], [null], [JSON.stringify({ graphmartUri: '' })]])(
      'returns the raw endpoint for config %s',
      (cfg) => {
        expect(exposed.url(makeConfig(cfg))).toBe(BASE)
      }
    )
  })
})
