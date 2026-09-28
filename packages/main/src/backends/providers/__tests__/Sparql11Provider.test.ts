import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { http, HttpResponse, delay } from 'msw'
import { setupServer } from 'msw/node'
import { Sparql11Provider } from '../Sparql11Provider'
import type { BackendConfig, BackendCredentials } from '../../types'

const ENDPOINT = 'http://sparql.test/query'

interface CapturedRequest {
  method: string
  url: string
  headers: Headers
  body: string
}

const captured: CapturedRequest[] = []
const server = setupServer()

function respondWith(resolver: () => Response | Promise<Response>) {
  server.use(
    http.all(ENDPOINT, async ({ request }) => {
      captured.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await request.text(),
      })
      return resolver()
    })
  )
}

function makeConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    id: 'b1',
    name: 'SPARQL',
    type: 'sparql-1.1',
    endpoint: ENDPOINT,
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

/** Credentials whose username getter throws, to simulate failures before the request. */
function throwingCredentials(thrown: unknown): BackendCredentials {
  return {
    backendId: 'b1',
    password: 'p',
    get username(): string {
      throw thrown
    },
  }
}

const selectResult = {
  head: { vars: ['s'] },
  results: { bindings: [{ s: { type: 'uri', value: 'http://ex/a' } }] },
}

describe('Sparql11Provider', () => {
  const provider = new Sparql11Provider()

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    captured.length = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    server.resetHandlers()
    vi.restoreAllMocks()
  })

  describe('execute', () => {
    it('POSTs a SELECT query and returns parsed JSON results', async () => {
      respondWith(() =>
        HttpResponse.json(selectResult, {
          headers: { 'Content-Type': 'application/sparql-results+json' },
        })
      )

      const query = 'SELECT ?s WHERE { ?s ?p ?o }'
      const result = await provider.execute(makeConfig(), query)

      expect(result).toEqual({
        data: selectResult,
        queryType: 'SELECT',
        contentType: 'application/sparql-results+json',
      })
      expect(captured).toHaveLength(1)
      expect(captured[0].method).toBe('POST')
      expect(captured[0].body).toBe(query)
      expect(captured[0].headers.get('content-type')).toBe('application/sparql-query')
      expect(captured[0].headers.get('accept')).toBe(
        'application/sparql-results+json, application/json'
      )
      expect(captured[0].headers.get('authorization')).toBeNull()
    })

    it('detects ASK queries', async () => {
      respondWith(() => HttpResponse.json({ head: {}, boolean: true }))
      const result = await provider.execute(makeConfig(), 'ASK { ?s ?p ?o }')
      expect(result.queryType).toBe('ASK')
      expect(result.data).toEqual({ head: {}, boolean: true })
      expect(captured[0].headers.get('accept')).toContain('application/sparql-results+json')
    })

    it.each([
      ['CONSTRUCT', 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'],
      ['DESCRIBE', 'DESCRIBE <http://ex/a>'],
    ])('requests Turtle for %s and returns raw text', async (type, query) => {
      const turtle = '<http://ex/a> <http://ex/p> "o" .'
      respondWith(() => new HttpResponse(turtle, { headers: { 'Content-Type': 'text/turtle' } }))

      const result = await provider.execute(makeConfig(), query)

      expect(result).toEqual({ data: turtle, queryType: type, contentType: 'text/turtle' })
      expect(captured[0].headers.get('accept')).toBe('text/turtle')
    })

    it('treats UPDATE requests as SELECT and sends them unchanged', async () => {
      respondWith(() => new HttpResponse(null, { status: 204 }))
      const update = 'INSERT DATA { <http://ex/a> <http://ex/p> "o" }'
      const result = await provider.execute(makeConfig(), update)
      expect(result.queryType).toBe('SELECT')
      expect(result.contentType).toBe('unknown')
      expect(captured[0].body).toBe(update)
    })

    it('treats unparseable queries as SELECT and still sends them', async () => {
      respondWith(() => HttpResponse.json(selectResult))
      const result = await provider.execute(makeConfig(), 'this is not sparql')
      expect(result.queryType).toBe('SELECT')
      expect(captured[0].body).toBe('this is not sparql')
    })

    it.each<[string, Partial<BackendConfig>, BackendCredentials, string | null]>([
      [
        'basic',
        { authType: 'basic' },
        { backendId: 'b1', username: 'u', password: 'p' },
        `Basic ${Buffer.from('u:p').toString('base64')}`,
      ],
      ['bearer', { authType: 'bearer' }, { backendId: 'b1', token: 'tok' }, 'Bearer tok'],
      ['none', { authType: 'none' }, { backendId: 'b1', token: 'tok' }, null],
    ])('sends %s auth headers', async (_name, cfg, creds, expected) => {
      respondWith(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig(cfg), 'SELECT * WHERE { ?s ?p ?o }', creds)
      expect(captured[0].headers.get('authorization')).toBe(expected)
    })

    it('sends custom auth headers', async () => {
      respondWith(() => HttpResponse.json(selectResult))
      await provider.execute(makeConfig({ authType: 'custom' }), 'SELECT * WHERE { ?s ?p ?o }', {
        backendId: 'b1',
        headers: { 'X-Api-Key': 'secret' },
      })
      expect(captured[0].headers.get('x-api-key')).toBe('secret')
    })

    it('rejects queries over 100KB without sending a request', async () => {
      await expect(provider.execute(makeConfig(), 'x'.repeat(100001))).rejects.toThrow(
        'Query too large (max 100KB)'
      )
      expect(captured).toHaveLength(0)
    })

    it.each([401, 403, 404, 500])(
      'maps HTTP %i to an error with the status code',
      async (status) => {
        respondWith(() => HttpResponse.json({ message: 'server said no' }, { status }))
        await expect(provider.execute(makeConfig(), 'SELECT * WHERE { ?s ?p ?o }')).rejects.toThrow(
          `SPARQL query failed (${status}): server said no`
        )
      }
    )

    it('falls back to the axios message when the body has no message', async () => {
      respondWith(() => new HttpResponse('boom', { status: 500 }))
      await expect(provider.execute(makeConfig(), 'SELECT * WHERE { ?s ?p ?o }')).rejects.toThrow(
        'SPARQL query failed (500): Request failed with status code 500'
      )
    })

    it('maps network errors', async () => {
      respondWith(() => HttpResponse.error())
      const err = await provider
        .execute(makeConfig(), 'SELECT * WHERE { ?s ?p ?o }')
        .catch((e: Error) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toMatch(/^SPARQL query failed \(network error\): /)
      expect(axios.isAxiosError((err as Error).cause)).toBe(true)
    })

    it('maps timeouts', async () => {
      const id = axios.interceptors.request.use((cfg) => ({ ...cfg, timeout: 20 }))
      try {
        respondWith(async () => {
          await delay(500)
          return HttpResponse.json(selectResult)
        })
        await expect(provider.execute(makeConfig(), 'SELECT * WHERE { ?s ?p ?o }')).rejects.toThrow(
          /SPARQL query failed \(network error\): timeout of 20ms exceeded/
        )
      } finally {
        axios.interceptors.request.eject(id)
      }
    })

    it('wraps non-axios errors thrown while preparing the request', async () => {
      const creds = throwingCredentials(new Error('keychain locked'))
      await expect(
        provider.execute(makeConfig({ authType: 'basic' }), 'SELECT * WHERE { ?s ?p ?o }', creds)
      ).rejects.toThrow('Query execution failed: keychain locked')
      expect(captured).toHaveLength(0)
    })

    it('wraps non-Error throwables as unknown errors', async () => {
      const creds = throwingCredentials('weird')
      await expect(
        provider.execute(makeConfig({ authType: 'basic' }), 'SELECT * WHERE { ?s ?p ?o }', creds)
      ).rejects.toThrow('Query execution failed: Unknown error')
    })
  })

  describe('validate', () => {
    it('rejects an invalid endpoint URL without a request', async () => {
      await expect(provider.validate(makeConfig({ endpoint: 'ftp://x' }))).resolves.toEqual({
        valid: false,
        error: 'Invalid endpoint URL',
      })
      expect(captured).toHaveLength(0)
    })

    it('sends a test SELECT query with auth and reports success', async () => {
      respondWith(() => HttpResponse.json(selectResult))
      const result = await provider.validate(makeConfig({ authType: 'bearer' }), {
        backendId: 'b1',
        token: 'tok',
      })
      expect(result).toEqual({ valid: true })
      expect(captured[0].method).toBe('POST')
      expect(captured[0].body).toContain('SELECT (COUNT(?s) as ?subjects)')
      expect(captured[0].headers.get('authorization')).toBe('Bearer tok')
    })

    it('reports unexpected 2xx status codes', async () => {
      respondWith(() => HttpResponse.json(selectResult, { status: 202 }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: 'Unexpected status code: 202',
      })
    })

    it.each([401, 403, 404, 500])('reports HTTP %i as a connection failure', async (status) => {
      respondWith(() => HttpResponse.json({ message: 'nope' }, { status }))
      await expect(provider.validate(makeConfig())).resolves.toEqual({
        valid: false,
        error: `Connection failed (${status}): nope`,
      })
    })

    it.each([
      [new Error('keychain locked'), 'Connection failed: keychain locked'],
      ['weird', 'Connection failed: Unknown error'],
    ])('reports non-HTTP failure %s', async (thrown, error) => {
      await expect(
        provider.validate(makeConfig({ authType: 'basic' }), throwingCredentials(thrown))
      ).resolves.toEqual({ valid: false, error })
    })

    it('reports network errors', async () => {
      respondWith(() => HttpResponse.error())
      const result = await provider.validate(makeConfig())
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/^Connection failed \(network error\): /)
    })
  })
})
