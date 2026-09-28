import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  normalizeBaseUrl,
  getQuerySettings,
  saveQuerySettings,
  getAISettings,
  saveAISettings,
  getCacheSettings,
  saveCacheSettings,
  getSparqlFormattingSettings,
  saveSparqlFormattingSettings,
  getPrefixSettings,
  savePrefixSettings,
  getQueryContextSettings,
  saveQueryContextSettings,
  fetchAIModels,
  testAIConnection,
  type AIConnectionSettings,
} from '../appSettings'

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

// happy-dom's localStorage cannot be reliably spied on and restored, so swap
// the whole global for one whose writes fail.
function failStorageWrites(message: string) {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error(message)
    },
  })
}

describe('appSettings', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('normalizeBaseUrl', () => {
    it.each([
      ['https://api.openai.com/v1', 'https://api.openai.com/v1'],
      ['https://api.openai.com/v1/', 'https://api.openai.com/v1'],
      ['https://api.openai.com', 'https://api.openai.com/v1'],
      ['https://api.openai.com/', 'https://api.openai.com/v1'],
      ['https://host/v1/chat/completions', 'https://host/v1'],
      ['http://localhost:11434/chat/completions', 'http://localhost:11434/v1'],
    ])('%s -> %s', (input, expected) => {
      expect(normalizeBaseUrl(input)).toBe(expected)
    })
  })

  describe.each([
    {
      name: 'query settings',
      key: 'shiny:settings:query',
      get: getQuerySettings,
      save: saveQuerySettings as (s: any) => void,
      defaults: { connectionTimeout: 30000, queryTimeout: 300000, maxRetries: 3, retryDelay: 1000 },
      partial: { maxRetries: 7 },
    },
    {
      name: 'AI settings',
      key: 'shiny:settings:ai',
      get: getAISettings,
      save: saveAISettings as (s: any) => void,
      defaults: {
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-3.5-turbo',
        apiKey: '',
        temperature: 0.7,
        maxTokens: 1000,
      },
      partial: { apiKey: 'sk-test', model: 'gpt-4o' },
    },
    {
      name: 'cache settings',
      key: 'shiny:settings:cache',
      get: getCacheSettings,
      save: saveCacheSettings as (s: any) => void,
      defaults: {
        enableAutocomplete: true,
        defaultTtl: 86400000,
        defaultMaxElements: 50000,
        autoRefresh: true,
        refreshCheckInterval: 300000,
      },
      partial: { autoRefresh: false },
    },
    {
      name: 'query context settings',
      key: 'shiny:settings:query-context',
      get: getQueryContextSettings,
      save: saveQueryContextSettings as (s: any) => void,
      defaults: { enabled: false, content: '' },
      partial: { enabled: true, content: '# Conventions' },
    },
  ])('$name', ({ key, get, save, defaults, partial }) => {
    it('returns defaults when nothing is stored', () => {
      expect(get()).toEqual(defaults)
    })

    it('returns a copy, not the shared defaults object', () => {
      const a = get() as any
      a[Object.keys(defaults)[0]] = 'mutated'
      expect(get()).toEqual(defaults)
    })

    it('merges stored partial values over defaults', () => {
      localStorage.setItem(key, JSON.stringify(partial))
      expect(get()).toEqual({ ...defaults, ...partial })
    })

    it('falls back to defaults on corrupt JSON', () => {
      localStorage.setItem(key, 'not json')
      expect(get()).toEqual(defaults)
      expect(console.warn).toHaveBeenCalled()
    })

    it('round-trips through save', () => {
      const value = { ...defaults, ...partial }
      save(value)
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(value)
      expect(get()).toEqual(value)
    })

    it('rethrows storage write failures', () => {
      failStorageWrites('quota exceeded')
      expect(() => save(defaults)).toThrow('quota exceeded')
      expect(console.warn).toHaveBeenCalled()
    })
  })

  describe('SPARQL formatting settings', () => {
    const key = 'shiny:settings:sparql-formatting'

    it('returns defaults when nothing is stored', () => {
      const s = getSparqlFormattingSettings()
      expect(s.indentSize).toBe(2)
      expect(s.keywordCase).toBe('uppercase')
      expect(s.insertSpaces.afterCommas).toBe(true)
      expect(s.lineBreaks.betweenPrefixAndQuery).toBe(true)
      expect(s.maxLineLength).toBe(120)
    })

    it('deep-merges nested insertSpaces and lineBreaks', () => {
      localStorage.setItem(
        key,
        JSON.stringify({
          indentSize: 4,
          insertSpaces: { afterCommas: false },
          lineBreaks: { betweenClauses: true },
        })
      )
      const s = getSparqlFormattingSettings()
      expect(s.indentSize).toBe(4)
      expect(s.useTabs).toBe(false)
      expect(s.insertSpaces).toEqual({
        afterCommas: false,
        beforeBraces: true,
        afterBraces: true,
        beforeParentheses: false,
        beforeStatementSeparators: false,
      })
      expect(s.lineBreaks.betweenClauses).toBe(true)
      expect(s.lineBreaks.afterPrefix).toBe(true)
    })

    it('handles stored settings without nested objects', () => {
      localStorage.setItem(key, JSON.stringify({ useTabs: true }))
      const s = getSparqlFormattingSettings()
      expect(s.useTabs).toBe(true)
      expect(s.insertSpaces.beforeBraces).toBe(true)
      expect(s.lineBreaks.afterSelect).toBe(true)
    })

    it('falls back to defaults on corrupt JSON', () => {
      localStorage.setItem(key, '{')
      expect(getSparqlFormattingSettings().indentSize).toBe(2)
    })

    it('round-trips through save and rethrows write failures', () => {
      const s = { ...getSparqlFormattingSettings(), keywordCase: 'lowercase' as const }
      saveSparqlFormattingSettings(s)
      expect(getSparqlFormattingSettings().keywordCase).toBe('lowercase')

      failStorageWrites('nope')
      expect(() => saveSparqlFormattingSettings(s)).toThrow('nope')
    })
  })

  describe('prefix settings', () => {
    const key = 'shiny:settings:prefix'

    it('returns the built-in prefixes by default', () => {
      const prefixes = getPrefixSettings().prefixes.map((p) => p.prefix)
      expect(prefixes).toEqual(['rdf', 'rdfs', 'owl', 'xsd', 'skos', 'dcterms', 'foaf'])
    })

    it('stored prefixes replace the default list', () => {
      localStorage.setItem(
        key,
        JSON.stringify({ prefixes: [{ prefix: 'ex', namespace: 'http://example.org/' }] })
      )
      expect(getPrefixSettings().prefixes).toEqual([
        { prefix: 'ex', namespace: 'http://example.org/' },
      ])
    })

    it('falls back to defaults on corrupt JSON', () => {
      localStorage.setItem(key, '[')
      expect(getPrefixSettings().prefixes).toHaveLength(7)
    })

    it('round-trips through save and rethrows write failures', () => {
      savePrefixSettings({ prefixes: [] })
      expect(getPrefixSettings().prefixes).toEqual([])
      failStorageWrites('nope')
      expect(() => savePrefixSettings({ prefixes: [] })).toThrow('nope')
    })
  })

  describe('fetchAIModels', () => {
    it('GETs /models on the normalized URL with a bearer token and returns model ids', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] }))

      const result = await fetchAIModels('https://api.example.com/', 'sk-123')

      expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/models', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-123' },
      })
      expect(result).toEqual({ success: true, models: ['gpt-4o', 'gpt-4o-mini'] })
    })

    it('returns an empty list when the response has no data array', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}))
      expect(await fetchAIModels('https://h/v1', 'k')).toEqual({ success: true, models: [] })
    })

    it('reports the API error message on non-OK responses', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'Invalid API key' } }, { ok: false, status: 401 })
      )
      const result = await fetchAIModels('https://h/v1', 'bad')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to fetch models from https://h/v1/models: Invalid API key')
    })

    it('falls back to statusText when the error body is not JSON', async () => {
      const res = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: vi.fn().mockRejectedValue(new Error('not json')),
      }
      fetchMock.mockResolvedValue(res)
      const result = await fetchAIModels('https://h', 'k')
      expect(result.error).toBe('Failed to fetch models from https://h/v1/models: Bad Gateway')
    })

    it('uses HTTP status when the error body has no message', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({}, { ok: false, status: 500, statusText: 'Server Error' })
      )
      const result = await fetchAIModels('https://h', 'k')
      expect(result.error).toContain('HTTP 500: Server Error')
    })

    it('returns network errors as failures', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
      expect(await fetchAIModels('https://h', 'k')).toEqual({
        success: false,
        error: 'ECONNREFUSED',
      })
    })

    it('handles non-Error throws', async () => {
      fetchMock.mockRejectedValue('boom')
      expect((await fetchAIModels('https://h', 'k')).error).toBe('Unknown error occurred')
    })
  })

  describe('testAIConnection', () => {
    const settings: AIConnectionSettings = {
      endpoint: 'https://api.example.com',
      model: 'gpt-4o',
      apiKey: 'sk-abc',
      temperature: 0.2,
      maxTokens: 50,
    }

    it('POSTs a chat completion and returns the reply', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'Octopuses have three hearts.' } }] })
      )

      const result = await testAIConnection(settings)

      expect(result).toEqual({
        success: true,
        response: 'Octopuses have three hearts.',
        url: 'https://api.example.com/v1/chat/completions',
      })
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.example.com/v1/chat/completions')
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe('Bearer sk-abc')
      const body = JSON.parse(init.body)
      expect(body).toMatchObject({ model: 'gpt-4o', temperature: 0.2, max_tokens: 50 })
      expect(body.messages[0].role).toBe('user')
    })

    it('applies default temperature and max tokens when unset', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [] }))
      const result = await testAIConnection({ endpoint: 'https://h/v1', model: 'm', apiKey: '' })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.temperature).toBe(0.7)
      expect(body.max_tokens).toBe(1000)
      expect(result.response).toBe('No response content')
    })

    it('sends temperature 0 when configured', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [] }))
      await testAIConnection({ endpoint: 'https://h/v1', model: 'm', apiKey: '', temperature: 0 })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.temperature).toBe(0)
    })

    it('reports API errors with the request URL', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: 'model not found' } }, { ok: false, status: 404 })
      )
      expect(await testAIConnection(settings)).toEqual({
        success: false,
        error: 'model not found',
        url: 'https://api.example.com/v1/chat/completions',
      })
    })

    it('falls back to HTTP status when the error body is unparseable', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        json: vi.fn().mockRejectedValue(new Error('x')),
      })
      expect((await testAIConnection(settings)).error).toBe('Unavailable')

      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500, statusText: 'ISE' }))
      expect((await testAIConnection(settings)).error).toBe('HTTP 500: ISE')
    })

    it('returns network errors as failures', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))
      expect(await testAIConnection(settings)).toMatchObject({ success: false, error: 'offline' })
      fetchMock.mockRejectedValue(42)
      expect((await testAIConnection(settings)).error).toBe('Unknown error occurred')
    })
  })
})
