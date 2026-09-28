import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ToolCall } from '../../../types/aiChat'

const store = {
  searchElements: vi.fn(),
  getCache: vi.fn(),
  getElementByIri: vi.fn(),
  isLoading: vi.fn(),
  refreshCache: vi.fn(),
  getError: vi.fn(),
}

vi.mock('../../../stores/ontologyCache', () => ({
  useOntologyCacheStore: () => store,
}))

import { executeTool } from '../toolExecutor'

function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: 'tc-1', name, arguments: args, status: 'approved' }
}

const ctx = { backendId: 'b1' }
const noBackend = { backendId: null }

const cls = (n: number) => ({
  iri: `http://ex.org/C${n}`,
  localName: `C${n}`,
  label: `Class ${n}`,
  description: `desc ${n}`,
  type: 'class',
})

const prop = {
  iri: 'http://ex.org/p',
  localName: 'p',
  label: 'P',
  description: undefined,
  type: 'property',
  propertyType: 'object',
  domain: ['http://ex.org/C1'],
  range: ['http://ex.org/C2'],
}

const indiv = {
  iri: 'http://ex.org/i',
  localName: 'i',
  label: 'I',
  type: 'individual',
  classIri: 'http://ex.org/C1',
}

describe('executeTool', () => {
  let execute: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    execute = vi.fn()
    ;(window as any).electronAPI = { query: { execute } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects unknown tools', async () => {
    expect(await executeTool(call('deleteEverything'), ctx)).toEqual({
      success: false,
      error: 'Unknown tool: deleteEverything',
    })
  })

  describe.each([
    ['searchOntology', { query: 'x' }],
    ['listOntologyElements', { type: 'class' }],
    ['getClassDetails', { iri: 'http://x' }],
    ['getPropertyDetails', { iri: 'http://x' }],
    ['runSparqlQuery', { query: 'ASK {}' }],
    ['refreshOntologyCache', {}],
  ])('%s without a backend', (name, args) => {
    it('fails with a no-backend error', async () => {
      expect(await executeTool(call(name, args), noBackend)).toEqual({
        success: false,
        error: 'No backend selected for the current query tab',
      })
    })
  })

  describe('searchOntology', () => {
    it('requires a query', async () => {
      const r = await executeTool(call('searchOntology', {}), ctx)
      expect(r).toEqual({ success: false, error: 'Query parameter is required' })
      expect(store.searchElements).not.toHaveBeenCalled()
    })

    it('searches with defaults and formats results', async () => {
      store.searchElements.mockResolvedValue([
        { element: cls(1), matchedField: 'label', score: 0.9 },
      ])
      const r = await executeTool(call('searchOntology', { query: 'person' }), ctx)
      expect(store.searchElements).toHaveBeenCalledWith('b1', {
        query: 'person',
        types: undefined,
        limit: 10,
      })
      expect(r).toEqual({
        success: true,
        result: {
          count: 1,
          results: [
            {
              iri: 'http://ex.org/C1',
              label: 'Class 1',
              type: 'class',
              description: 'desc 1',
              matchedField: 'label',
              score: 0.9,
            },
          ],
        },
      })
    })

    it('parses types and clamps limit', async () => {
      store.searchElements.mockResolvedValue([])
      await executeTool(
        call('searchOntology', { query: 'a', types: 'class, property', limit: '500' }),
        ctx
      )
      expect(store.searchElements).toHaveBeenLastCalledWith('b1', {
        query: 'a',
        types: ['class', 'property'],
        limit: 50,
      })

      await executeTool(call('searchOntology', { query: 'a', limit: '-3' }), ctx)
      expect(store.searchElements.mock.lastCall![1].limit).toBe(1)

      await executeTool(call('searchOntology', { query: 'a', limit: 'abc' }), ctx)
      expect(store.searchElements.mock.lastCall![1].limit).toBe(10)
    })

    it('returns store errors as failures', async () => {
      store.searchElements.mockRejectedValue(new Error('idb closed'))
      expect(await executeTool(call('searchOntology', { query: 'a' }), ctx)).toEqual({
        success: false,
        error: 'idb closed',
      })
      store.searchElements.mockRejectedValue('x')
      expect((await executeTool(call('searchOntology', { query: 'a' }), ctx)).error).toBe(
        'Search failed'
      )
    })
  })

  describe('listOntologyElements', () => {
    const cache = {
      classes: Array.from({ length: 45 }, (_, i) => cls(i)),
      properties: [prop],
      individuals: [indiv],
    }

    it('validates the type parameter', async () => {
      for (const args of [{}, { type: 'thing' }]) {
        expect(await executeTool(call('listOntologyElements', args), ctx)).toEqual({
          success: false,
          error: 'Type parameter must be one of: class, property, individual',
        })
      }
    })

    it('fails when there is no cache', async () => {
      store.getCache.mockReturnValue(null)
      const r = await executeTool(call('listOntologyElements', { type: 'class' }), ctx)
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/cache not available/)
    })

    it('paginates classes with default page size 20', async () => {
      store.getCache.mockReturnValue(cache)
      const r = (await executeTool(call('listOntologyElements', { type: 'class' }), ctx)) as any
      expect(store.getCache).toHaveBeenCalledWith('b1')
      expect(r.result).toMatchObject({
        type: 'class',
        page: 1,
        pageSize: 20,
        totalCount: 45,
        totalPages: 3,
        hasMore: true,
        count: 20,
      })
      expect(r.result.elements[0]).toEqual({
        iri: 'http://ex.org/C0',
        localName: 'C0',
        label: 'Class 0',
        description: 'desc 0',
        type: 'class',
      })
    })

    it('returns the last page without hasMore', async () => {
      store.getCache.mockReturnValue(cache)
      const r = (await executeTool(
        call('listOntologyElements', { type: 'class', page: '3' }),
        ctx
      )) as any
      expect(r.result.count).toBe(5)
      expect(r.result.hasMore).toBe(false)
      expect(r.result.elements[0].iri).toBe('http://ex.org/C40')
    })

    it('clamps page and pageSize', async () => {
      store.getCache.mockReturnValue(cache)
      const r = (await executeTool(
        call('listOntologyElements', { type: 'class', page: '0', pageSize: '5000' }),
        ctx
      )) as any
      expect(r.result.page).toBe(1)
      expect(r.result.pageSize).toBe(1000)
      expect(r.result.count).toBe(45)
    })

    it('formats properties with domain/range and individuals with classIri', async () => {
      store.getCache.mockReturnValue(cache)
      const p = (await executeTool(call('listOntologyElements', { type: 'property' }), ctx)) as any
      expect(p.result.elements[0]).toMatchObject({
        propertyType: 'object',
        domain: ['http://ex.org/C1'],
        range: ['http://ex.org/C2'],
      })
      const i = (await executeTool(
        call('listOntologyElements', { type: 'individual' }),
        ctx
      )) as any
      expect(i.result.elements[0].classIri).toBe('http://ex.org/C1')
    })

    it('returns thrown errors as failures', async () => {
      store.getCache.mockImplementation(() => {
        throw new Error('bad')
      })
      expect(await executeTool(call('listOntologyElements', { type: 'class' }), ctx)).toEqual({
        success: false,
        error: 'bad',
      })
    })
  })

  describe.each([
    ['getClassDetails', 'class', 'class'],
    ['getPropertyDetails', 'property', 'property'],
  ])('%s', (tool, elementType, key) => {
    it('requires an IRI', async () => {
      expect(await executeTool(call(tool, {}), ctx)).toEqual({
        success: false,
        error: 'IRI parameter is required',
      })
    })

    it('reports not found as a successful lookup', async () => {
      store.getElementByIri.mockResolvedValue(null)
      const r = (await executeTool(call(tool, { iri: 'http://ex.org/none' }), ctx)) as any
      expect(store.getElementByIri).toHaveBeenCalledWith('b1', 'http://ex.org/none', elementType)
      expect(r.success).toBe(true)
      expect(r.result.found).toBe(false)
      expect(r.result.message).toContain('http://ex.org/none')
    })

    it('returns the formatted element', async () => {
      const el = elementType === 'class' ? cls(1) : prop
      store.getElementByIri.mockResolvedValue(el)
      const r = (await executeTool(call(tool, { iri: el.iri }), ctx)) as any
      expect(r.result.found).toBe(true)
      expect(r.result[key].iri).toBe(el.iri)
    })

    it('returns store errors as failures', async () => {
      store.getElementByIri.mockRejectedValue(new Error('boom'))
      expect(await executeTool(call(tool, { iri: 'http://x' }), ctx)).toEqual({
        success: false,
        error: 'boom',
      })
      store.getElementByIri.mockRejectedValue(null)
      expect((await executeTool(call(tool, { iri: 'http://x' }), ctx)).error).toMatch(/Failed/)
    })
  })

  describe('runSparqlQuery', () => {
    it('requires a query', async () => {
      expect(await executeTool(call('runSparqlQuery', {}), ctx)).toEqual({
        success: false,
        error: 'Query parameter is required',
      })
      expect(execute).not.toHaveBeenCalled()
    })

    it('appends a safety LIMIT 100 when none is present', async () => {
      execute.mockResolvedValue({ queryType: 'SELECT', data: { head: { vars: [] } } })
      await executeTool(call('runSparqlQuery', { query: 'SELECT * WHERE { ?s ?p ?o }  ' }), ctx)
      expect(execute).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }\nLIMIT 100', 'b1')
    })

    it('applies a clamped limit override', async () => {
      execute.mockResolvedValue({ queryType: 'SELECT', data: {} })
      await executeTool(call('runSparqlQuery', { query: 'SELECT * {}', limit: '500' }), ctx)
      expect(execute).toHaveBeenLastCalledWith('SELECT * {}\nLIMIT 100', 'b1')
      await executeTool(call('runSparqlQuery', { query: 'SELECT * {}', limit: '5' }), ctx)
      expect(execute).toHaveBeenLastCalledWith('SELECT * {}\nLIMIT 5', 'b1')
    })

    it('does not add a LIMIT when the query already has one', async () => {
      execute.mockResolvedValue({ queryType: 'SELECT', data: {} })
      await executeTool(call('runSparqlQuery', { query: 'SELECT * {} limit 7' }), ctx)
      expect(execute).toHaveBeenLastCalledWith('SELECT * {} limit 7', 'b1')
      await executeTool(call('runSparqlQuery', { query: 'SELECT * {} LIMIT 7', limit: '3' }), ctx)
      expect(execute).toHaveBeenLastCalledWith('SELECT * {} LIMIT 7', 'b1')
    })

    it('formats SELECT results, truncating to 20 rows', async () => {
      const bindings = Array.from({ length: 25 }, (_, i) => ({
        s: { type: 'uri', value: `http://ex.org/${i}` },
        n: { type: 'literal', value: String(i) },
      }))
      execute.mockResolvedValue({
        queryType: 'select',
        data: { head: { vars: ['s', 'n'] }, results: { bindings } },
      })
      const r = (await executeTool(
        call('runSparqlQuery', { query: 'SELECT ?s ?n {}' }),
        ctx
      )) as any
      expect(r.success).toBe(true)
      expect(r.result.type).toBe('select')
      expect(r.result.rowCount).toBe(25)
      expect(r.result.columns).toEqual(['s', 'n'])
      expect(r.result.rows).toHaveLength(20)
      expect(r.result.rows[0]).toEqual({ s: 'http://ex.org/0', n: '0' })
      expect(r.result.truncated).toBe(true)
    })

    it('handles SELECT results with no data', async () => {
      execute.mockResolvedValue({ queryType: 'SELECT' })
      const r = (await executeTool(call('runSparqlQuery', { query: 'SELECT * {}' }), ctx)) as any
      expect(r.result).toEqual({
        type: 'select',
        rowCount: 0,
        columns: [],
        rows: [],
        truncated: false,
      })
    })

    it('formats CONSTRUCT results with a triple count', async () => {
      const turtle =
        '@prefix ex: <http://ex.org/> .\nex:a ex:p ex:b .\nex:a ex:q "lit" .\nex:c ex:p ex:a .\n'
      execute.mockResolvedValue({ queryType: 'CONSTRUCT', data: turtle })
      const r = (await executeTool(
        call('runSparqlQuery', { query: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }' }),
        ctx
      )) as any
      expect(r.result).toEqual({
        type: 'construct',
        tripleCount: 3,
        format: 'turtle',
        data: turtle,
        truncated: false,
      })
    })

    it('truncates long DESCRIBE output and tolerates unparseable Turtle', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const junk = 'not turtle at all ' + 'x'.repeat(5000)
      execute.mockResolvedValue({ queryType: 'DESCRIBE', data: junk })
      const r = (await executeTool(
        call('runSparqlQuery', { query: 'DESCRIBE <http://ex.org/a>' }),
        ctx
      )) as any
      expect(r.result.type).toBe('describe')
      expect(r.result.tripleCount).toBeNull()
      expect(r.result.data).toHaveLength(4000)
      expect(r.result.truncated).toBe(true)
    })

    it('treats non-string CONSTRUCT data as empty Turtle', async () => {
      execute.mockResolvedValue({ queryType: 'CONSTRUCT', data: { unexpected: true } })
      const r = (await executeTool(
        call('runSparqlQuery', { query: 'CONSTRUCT {} {}' }),
        ctx
      )) as any
      expect(r.result.data).toBe('')
      expect(r.result.tripleCount).toBe(0)
    })

    it('formats ASK results', async () => {
      execute.mockResolvedValue({ queryType: 'ASK', data: { head: {}, boolean: false } })
      const r = (await executeTool(call('runSparqlQuery', { query: 'ASK {}' }), ctx)) as any
      expect(r.result).toEqual({ type: 'ask', answer: false })

      execute.mockResolvedValue({ queryType: 'ASK', data: true })
      const r2 = (await executeTool(call('runSparqlQuery', { query: 'ASK {}' }), ctx)) as any
      expect(r2.result.answer).toBe(true)
    })

    it('passes through unknown query types', async () => {
      execute.mockResolvedValue({ data: 'raw' })
      const r = (await executeTool(call('runSparqlQuery', { query: 'SELECT * {}' }), ctx)) as any
      expect(r.result).toEqual({ type: 'unknown', data: 'raw' })
    })

    it('returns execution errors as failures', async () => {
      execute.mockRejectedValue(new Error('timeout'))
      expect(await executeTool(call('runSparqlQuery', { query: 'ASK {}' }), ctx)).toEqual({
        success: false,
        error: 'timeout',
      })
      execute.mockRejectedValue({})
      expect((await executeTool(call('runSparqlQuery', { query: 'ASK {}' }), ctx)).error).toBe(
        'Query execution failed'
      )
    })
  })

  describe('refreshOntologyCache', () => {
    it('does not start a second refresh', async () => {
      store.isLoading.mockReturnValue(true)
      const r = (await executeTool(call('refreshOntologyCache'), ctx)) as any
      expect(r.result.status).toBe('already_refreshing')
      expect(store.refreshCache).not.toHaveBeenCalled()
    })

    it('refreshes and reports stats', async () => {
      store.isLoading.mockReturnValue(false)
      store.refreshCache.mockResolvedValue({
        classes: [cls(1), cls(2)],
        properties: [prop],
        individuals: [],
      })
      const r = (await executeTool(call('refreshOntologyCache'), ctx)) as any
      expect(store.refreshCache).toHaveBeenCalledWith('b1', false)
      expect(r.result).toMatchObject({
        status: 'refreshed',
        stats: { classCount: 2, propertyCount: 1, individualCount: 0 },
      })
    })

    it('reports the store error when refresh returns nothing', async () => {
      store.isLoading.mockReturnValue(false)
      store.refreshCache.mockResolvedValue(null)
      store.getError.mockReturnValue('Endpoint unreachable')
      expect(await executeTool(call('refreshOntologyCache'), ctx)).toEqual({
        success: false,
        error: 'Endpoint unreachable',
      })
      store.getError.mockReturnValue(null)
      expect((await executeTool(call('refreshOntologyCache'), ctx)).error).toBe(
        'Failed to refresh ontology cache'
      )
    })

    it('returns thrown errors as failures', async () => {
      store.isLoading.mockReturnValue(false)
      store.refreshCache.mockRejectedValue(new Error('net'))
      expect((await executeTool(call('refreshOntologyCache'), ctx)).error).toBe('net')
      store.refreshCache.mockRejectedValue(1)
      expect((await executeTool(call('refreshOntologyCache'), ctx)).error).toBe(
        'Cache refresh failed'
      )
    })
  })

  describe('getQueryContext', () => {
    const KEY = 'shiny:settings:query-context'

    it('reports unavailable when disabled', async () => {
      const r = (await executeTool(call('getQueryContext'), noBackend)) as any
      expect(r.success).toBe(true)
      expect(r.result.available).toBe(false)
      expect(r.result.message).toMatch(/not enabled/)
    })

    it('reports unavailable when enabled but empty', async () => {
      localStorage.setItem(KEY, JSON.stringify({ enabled: true, content: '   ' }))
      const r = (await executeTool(call('getQueryContext'), ctx)) as any
      expect(r.result.available).toBe(false)
      expect(r.result.message).toMatch(/no content/)
    })

    it('returns the configured content', async () => {
      localStorage.setItem(KEY, JSON.stringify({ enabled: true, content: 'Use ex: prefix' }))
      expect(await executeTool(call('getQueryContext'), ctx)).toEqual({
        success: true,
        result: { available: true, content: 'Use ex: prefix' },
      })
    })
  })
})
