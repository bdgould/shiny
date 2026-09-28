import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ResultsView from '../results/ResultsView.vue'
import SelectTableView from '../results/SelectTableView.vue'
import CellValue from '../results/CellValue.vue'
import JsonView from '../results/JsonView.vue'
import ConstructEntityTableView from '../results/ConstructEntityTableView.vue'
import RdfSerializationView from '../results/RdfSerializationView.vue'
import AskBadgeView from '../results/AskBadgeView.vue'
import { useTabsStore } from '@/stores/tabs'
import { useQueryStore } from '@/stores/query'
import type { QueryType } from '@/services/sparql/queryDetector'

const TURTLE = `@prefix ex: <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
ex:alice foaf:name "Alice"@en ;
  foaf:age "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
ex:bob foaf:name "Bob" .
`

const selectData = {
  head: { vars: ['s', 'label'] },
  results: {
    bindings: [
      {
        s: { type: 'uri', value: 'http://example.org/a' },
        label: { type: 'literal', value: 'A', 'xml:lang': 'en' },
      },
      { s: { type: 'bnode', value: 'b0' } },
    ],
  },
}

describe('CellValue', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders a shortened URI link with the full URI as title', () => {
    const w = mount(CellValue, {
      props: { value: 'http://xmlns.com/foaf/0.1/name', type: 'uri' },
    })
    const a = w.find('a.uri-link')
    expect(a.text()).toBe('foaf:name')
    expect(a.attributes('href')).toBe('http://xmlns.com/foaf/0.1/name')
    expect(a.attributes('title')).toBe('http://xmlns.com/foaf/0.1/name')
  })

  it('does not shorten non-http URIs', () => {
    const w = mount(CellValue, { props: { value: 'mailto:x@y.z', type: 'uri' } })
    expect(w.find('a').text()).toBe('mailto:x@y.z')
  })

  it('copies a URI on plain click and shows a transient Copied! state', async () => {
    const w = mount(CellValue, { props: { value: 'http://example.org/x', type: 'uri' } })
    await w.find('a').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('http://example.org/x')
    expect(w.find('a').text()).toContain('Copied!')
    expect(w.find('a').classes()).toContain('copied')

    vi.advanceTimersByTime(2000)
    await w.vm.$nextTick()
    expect(w.find('a').text()).toBe('...' + '/x')
  })

  it('lets Ctrl/Cmd+click through without copying', async () => {
    const w = mount(CellValue, { props: { value: 'http://example.org/x', type: 'uri' } })
    await w.find('a').trigger('click', { ctrlKey: true })
    await w.find('a').trigger('click', { metaKey: true })
    await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('renders a literal with a language tag', () => {
    const w = mount(CellValue, { props: { value: 'hello', type: 'literal', language: 'en' } })
    expect(w.find('.literal').text()).toContain('hello')
    expect(w.find('.annotation').text()).toBe('@en')
  })

  it('renders a non-default datatype, shortened', () => {
    const w = mount(CellValue, {
      props: {
        value: '5',
        type: 'literal',
        datatype: 'http://www.w3.org/2001/XMLSchema#integer',
      },
    })
    expect(w.find('.annotation').text()).toBe('^^xsd:integer')
  })

  it('hides xsd:string and rdf:langString datatypes', () => {
    for (const datatype of [
      'http://www.w3.org/2001/XMLSchema#string',
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
    ]) {
      const w = mount(CellValue, { props: { value: 'x', type: 'literal', datatype } })
      expect(w.find('.annotation').exists()).toBe(false)
    }
  })

  it('copies a literal on click', async () => {
    const w = mount(CellValue, { props: { value: 'lit', type: 'literal' } })
    await w.find('.literal').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('lit')
    expect(w.find('.literal').text()).toContain('Copied!')
  })

  it('renders and copies a blank node with _: prefix', async () => {
    const w = mount(CellValue, { props: { value: 'b1', type: 'bnode' } })
    expect(w.find('.bnode').text()).toBe('_:b1')
    await w.find('.bnode').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('_:b1')
  })

  it('logs and stays unchanged when the clipboard write fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(CellValue, { props: { value: 'lit', type: 'literal' } })
    await w.find('.literal').trigger('click')
    await flushPromises()
    expect(err).toHaveBeenCalled()
    expect(w.find('.literal').text()).not.toContain('Copied!')
  })

  it('renders an empty placeholder or raw value for unknown types', () => {
    expect(
      mount(CellValue, { props: { value: '', type: 'other' } })
        .find('.empty')
        .text()
    ).toBe('-')
    expect(
      mount(CellValue, { props: { value: 'raw', type: 'typed-literal' } })
        .find('.unknown')
        .text()
    ).toBe('raw')
  })
})

describe('SelectTableView', () => {
  it('renders headers, rows, and missing bindings as dashes', () => {
    const w = mount(SelectTableView, { props: { results: selectData } })
    expect(w.findAll('th').map((t) => t.text())).toEqual(['s', 'label'])
    const rows = w.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1].findAll('td')[1].find('.empty').text()).toBe('-')
    expect(w.findAllComponents(CellValue)).toHaveLength(3)
    expect(w.find('.table-footer').text()).toBe('2 rows')
  })

  it('uses singular row label and handles zero rows', () => {
    const one = mount(SelectTableView, {
      props: {
        results: {
          head: { vars: ['x'] },
          results: { bindings: [{ x: { type: 'literal', value: '1' } }] },
        },
      },
    })
    expect(one.find('.table-footer').text()).toBe('1 row')
    const none = mount(SelectTableView, {
      props: { results: { head: { vars: ['x'] }, results: { bindings: [] } } },
    })
    expect(none.findAll('tbody tr')).toHaveLength(0)
    expect(none.find('.table-footer').text()).toBe('0 rows')
  })
})

describe('JsonView', () => {
  it('pretty prints data with one line number per line', () => {
    const w = mount(JsonView, { props: { data: { a: 1, b: [2] } } })
    const text = w.find('.code-content').text()
    expect(text).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2))
    expect(w.findAll('.line-number')).toHaveLength(text.split('\n').length)
  })

  it('falls back to String() for values that cannot be stringified', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const w = mount(JsonView, { props: { data: circular } })
    expect(w.find('.code-content').text()).toBe('[object Object]')
  })
})

describe('ConstructEntityTableView', () => {
  it('shows empty state when no data', async () => {
    const w = mount(ConstructEntityTableView, { props: { turtleData: '' } })
    await flushPromises()
    expect(w.find('.empty').text()).toBe('No RDF triples found')
  })

  it('groups triples by subject with metrics', async () => {
    const w = mount(ConstructEntityTableView, { props: { turtleData: TURTLE } })
    await flushPromises()
    const cards = w.findAll('.entity-card')
    expect(cards).toHaveLength(2)
    const metrics = w.findAll('.metric').map((m) => m.text())
    expect(metrics[0]).toBe('2entities')
    expect(metrics[1]).toBe('3statements')
    expect(w.text()).toContain('2 triples')
    expect(w.text()).toContain('1 triple')
  })

  it('collapses and expands entities', async () => {
    const w = mount(ConstructEntityTableView, { props: { turtleData: TURTLE } })
    await flushPromises()
    const tables = () => w.findAll('.entity-table')
    const hidden = (t: ReturnType<typeof tables>[number]) =>
      (t.attributes('style') ?? '').includes('display: none')
    await w.findAll('.entity-header')[0].trigger('click')
    expect(hidden(tables()[0])).toBe(true)
    expect(w.findAll('.collapse-button')[0].classes()).toContain('collapsed')
    await w.findAll('.entity-header')[0].trigger('click')
    expect(hidden(tables()[0])).toBe(false)

    const [expand, collapse] = w.findAll('.control-button')
    await collapse.trigger('click')
    expect(tables().every(hidden)).toBe(true)
    await expand.trigger('click')
    expect(tables().some(hidden)).toBe(false)
  })

  it('shows a parse error for invalid Turtle and re-parses on prop change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(ConstructEntityTableView, { props: { turtleData: 'this is not turtle <<' } })
    await flushPromises()
    expect(w.find('.error').text()).toContain('Failed to parse RDF data')

    await w.setProps({ turtleData: TURTLE })
    await flushPromises()
    expect(w.find('.error').exists()).toBe(false)
    expect(w.findAll('.entity-card')).toHaveLength(2)
  })
})

describe('RdfSerializationView', () => {
  it('shows empty state with no data', async () => {
    const w = mount(RdfSerializationView, { props: { turtleData: '', format: 'ntriples' } })
    await flushPromises()
    expect(w.find('.empty').text()).toBe('No data to display')
  })

  it('passes Turtle through unchanged', async () => {
    const w = mount(RdfSerializationView, { props: { turtleData: TURTLE, format: 'turtle' } })
    await flushPromises()
    expect(w.find('.code-content').text()).toBe(TURTLE.trim())
    expect(w.findAll('.line-number').length).toBe(TURTLE.split('\n').length)
  })

  it('converts to N-Triples, N-Quads and JSON-LD', async () => {
    const w = mount(RdfSerializationView, { props: { turtleData: TURTLE, format: 'ntriples' } })
    await flushPromises()
    expect(w.find('.code-content').text()).toContain(
      '<http://example.org/alice> <http://xmlns.com/foaf/0.1/name> "Alice"@en .'
    )

    await w.setProps({ format: 'nquads' })
    await flushPromises()
    expect(w.find('.code-content').text()).toContain('<http://example.org/bob>')

    await w.setProps({ format: 'jsonld' })
    await flushPromises()
    const json = w.find('.code-content').text()
    expect(json).toContain('http://example.org/alice')
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('shows an error for unparsable input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = mount(RdfSerializationView, {
      props: { turtleData: 'garbage <<', format: 'ntriples' },
    })
    await flushPromises()
    expect(w.find('.error').text()).toContain('Failed to serialize RDF data')
  })
})

describe('ResultsView', () => {
  beforeEach(() => {
    localStorage.clear()
    // Seed explicit defaults: viewPreferences mutates its shared default object when
    // nothing is stored, so relying on an empty store leaks state between tests.
    localStorage.setItem(
      'shiny:query:view-preferences',
      JSON.stringify({ select: 'table', construct: 'entity-table', ask: 'badge' })
    )
    setActivePinia(createPinia())
  })

  function setup(queryType: QueryType | null, data: unknown) {
    const tabs = useTabsStore()
    const id = tabs.createTab()
    tabs.setTabResults(id, { data, queryType }, queryType)
    return mount(ResultsView, {
      global: {
        stubs: {
          ConstructEntityTableView: true,
          RdfSerializationView: true,
        },
      },
    })
  }

  it('renders SELECT results as a table by default and toggles to JSON', async () => {
    const w = setup('SELECT', selectData)
    expect(w.find('.query-type-badge').text()).toBe('SELECT')
    expect(w.findComponent(SelectTableView).exists()).toBe(true)
    const buttons = w.findAll('.view-button')
    expect(buttons.map((b) => b.text())).toEqual(['Table', 'JSON'])
    expect(buttons[0].classes()).toContain('active')

    await buttons[1].trigger('click')
    expect(useQueryStore().currentSelectView).toBe('json')
    expect(w.findComponent(SelectTableView).exists()).toBe(false)
    expect(w.findComponent(JsonView).props('data')).toEqual(selectData)

    await w.findAll('.view-button')[0].trigger('click')
    expect(w.findComponent(SelectTableView).exists()).toBe(true)
  })

  it('renders ASK results as a badge and toggles to JSON', async () => {
    const w = setup('ASK', { head: {}, boolean: true })
    expect(w.findComponent(AskBadgeView).exists()).toBe(true)
    const buttons = w.findAll('.view-button')
    expect(buttons.map((b) => b.text())).toEqual(['Badge', 'JSON'])
    await buttons[1].trigger('click')
    expect(w.findComponent(AskBadgeView).exists()).toBe(false)
    expect(w.findComponent(JsonView).exists()).toBe(true)
    await w.findAll('.view-button')[0].trigger('click')
    expect(w.findComponent(AskBadgeView).exists()).toBe(true)
  })

  it.each(['CONSTRUCT', 'DESCRIBE'] as const)(
    'renders %s results in the entity view and switches serializations',
    async (qt) => {
      const w = setup(qt, TURTLE)
      expect(w.findComponent(ConstructEntityTableView).props('turtleData')).toBe(TURTLE)
      const buttons = w.findAll('.view-button')
      expect(buttons.map((b) => b.text())).toEqual([
        'Entity View',
        'Turtle',
        'N-Triples',
        'N-Quads',
        'JSON-LD',
      ])
      const formats = ['turtle', 'ntriples', 'nquads', 'jsonld']
      for (let i = 1; i < buttons.length; i++) {
        await w.findAll('.view-button')[i].trigger('click')
        const rdf = w.findComponent(RdfSerializationView)
        expect(rdf.props('format')).toBe(formats[i - 1])
        expect(w.findAll('.view-button')[i].classes()).toContain('active')
      }
      await w.findAll('.view-button')[0].trigger('click')
      expect(w.findComponent(ConstructEntityTableView).exists()).toBe(true)
      expect(useQueryStore().currentConstructView).toBe('entity-table')
    }
  )

  it('falls back to raw JSON for unknown query types', () => {
    const w = setup(null, { foo: 'bar' })
    expect(w.find('.query-type-badge').exists()).toBe(false)
    expect(w.findAll('.view-button')).toHaveLength(0)
    expect(w.findComponent(JsonView).props('data')).toEqual({
      data: { foo: 'bar' },
      queryType: null,
    })
  })
})
