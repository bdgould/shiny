import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CacheSettingsView from '../settings/CacheSettingsView.vue'
import { useConnectionStore } from '@/stores/connection'
import type { BackendConfig } from '@/types/backends'
import {
  DEFAULT_CACHE_CONFIG,
  type AnyOntologyElement,
  type CacheStats,
} from '@/types/ontologyCache'

const cacheStore = {
  validateCache: vi.fn(),
  getStats: vi.fn(),
  getCache: vi.fn(),
  searchElements: vi.fn(),
  refreshCache: vi.fn(),
  invalidateCache: vi.fn(),
}
vi.mock('@/stores/ontologyCache', () => ({ useOntologyCacheStore: () => cacheStore }))

const NOW = new Date('2026-06-01T12:00:00Z').getTime()

const STATS: CacheStats = {
  classCount: 2,
  propertyCount: 1,
  individualCount: 1,
  totalCount: 4,
  namespaceCount: 1,
}

const ELEMENTS: AnyOntologyElement[] = [
  { type: 'class', iri: 'http://ex.org/Person', label: 'Person', description: 'A human' },
  { type: 'class', iri: 'http://ex.org/Thing', localName: 'Thing' },
  {
    type: 'property',
    iri: 'http://ex.org/knows',
    label: 'knows',
    propertyType: 'object',
    domain: ['http://ex.org/Person'],
    range: ['http://ex.org/Person'],
  },
  { type: 'individual', iri: 'http://ex.org/alice', classes: ['http://ex.org/Person'] },
]

function backend(id: string, overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    id,
    name: `Backend ${id}`,
    type: 'sparql-1.1',
    endpoint: `https://${id}.example/sparql`,
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

const enabledConfig = {
  ...DEFAULT_CACHE_CONFIG,
  enabled: true,
  ttl: 12 * 3600000,
  maxElements: 2000,
  queries: { classes: 'SELECT C', properties: 'SELECT P', individuals: 'SELECT I' },
}

let wrapper: VueWrapper
let api: { update: ReturnType<typeof vi.fn>; testQuery: ReturnType<typeof vi.fn> }
let writeText: ReturnType<typeof vi.fn>
let confirmMock: ReturnType<typeof vi.fn>

function withCache(exists = true) {
  cacheStore.validateCache.mockResolvedValue({ exists, valid: exists, stale: false })
  cacheStore.getStats.mockResolvedValue(STATS)
  cacheStore.getCache.mockResolvedValue({ metadata: { lastUpdated: NOW - 2 * 3600000 } })
  cacheStore.searchElements.mockResolvedValue(ELEMENTS.map((element) => ({ element, score: 1 })))
}

async function mountView(backends: BackendConfig[]) {
  useConnectionStore().backends = backends
  wrapper = mount(CacheSettingsView)
  await flushPromises()
  return wrapper
}

const section = (w: VueWrapper, title: string) =>
  w.findAll('.section-header').find((h) => h.text().includes(title))!

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(NOW)
  localStorage.clear()
  setActivePinia(createPinia())
  Object.values(cacheStore).forEach((fn) => fn.mockReset())
  withCache(false)
  cacheStore.refreshCache.mockResolvedValue(undefined)
  cacheStore.invalidateCache.mockResolvedValue(undefined)
  api = {
    update: vi.fn(async (id: string, updates: object) => ({ ...backend(id), ...updates })),
    testQuery: vi.fn(),
  }
  Object.assign(window.electronAPI.backends, { update: api.update })
  ;(window.electronAPI as unknown as Record<string, unknown>).cache = { testQuery: api.testQuery }
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  confirmMock = vi.fn(() => true)
  vi.stubGlobal('confirm', confirmMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CacheSettingsView - global settings', () => {
  it('shows no backend section when there are no backends', async () => {
    const w = await mountView([])
    expect(w.findAll('#backend-select option')).toHaveLength(1)
    expect(w.text()).not.toContain('Backend Configuration')
  })

  it('toggles the global section and saves global settings', async () => {
    const w = await mountView([])
    const content = () => w.findAll('.section-content')[0]
    expect(content().attributes('style')).toContain('display: none')
    await section(w, 'Global Settings').trigger('click')
    expect(content().attributes('style') ?? '').not.toContain('display: none')

    await w.find('#refresh-interval').setValue('10')
    const boxes = content().findAll('input[type="checkbox"]')
    await boxes[0].setValue(false)
    await w.find('.btn-primary').trigger('click')
    expect(JSON.parse(localStorage.getItem('shiny:settings:cache')!)).toMatchObject({
      enableAutocomplete: false,
      autoRefresh: true,
      refreshCheckInterval: 600000,
    })
    expect(w.find('.save-message').text()).toBe('Settings saved successfully!')
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(w.find('.save-message').exists()).toBe(false)

    await boxes[1].setValue(false)
    expect(w.find('#refresh-interval').exists()).toBe(false)
  })

  it('reports global save failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = await mountView([])
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await w.find('.btn-primary').trigger('click')
    setItem.mockRestore()
    expect(w.find('.save-message').text()).toBe('Failed to save settings: quota')
    expect(w.find('.save-message').classes()).toContain('error')
  })
})

describe('CacheSettingsView - backend configuration', () => {
  it('auto-selects the first backend and loads its disabled default config', async () => {
    const w = await mountView([backend('a'), backend('b')])
    expect((w.find('#backend-select').element as HTMLSelectElement).value).toBe('a')
    expect(w.find('#backend-select').text()).toContain('Backend b (sparql-1.1)')
    expect(w.text()).toContain('Backend Configuration')
    expect(w.find('#cache-ttl').exists()).toBe(false)
    expect(w.text()).not.toContain('SPARQL Queries')
  })

  it('loads an enabled backend config with stats and browser', async () => {
    withCache(true)
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    expect((w.find('#cache-ttl').element as HTMLInputElement).value).toBe('12')
    expect((w.find('#max-elements').element as HTMLInputElement).value).toBe('2000')
    const status = w.find('.status-grid').text()
    expect(status).toContain('Classes:2')
    expect(status).toContain('Last Updated:2 hours ago')
    expect(w.text()).toContain('(4 total)')
    expect(cacheStore.searchElements).toHaveBeenCalledWith('a', {
      query: '',
      types: ['class', 'property', 'individual'],
      limit: 50,
      caseSensitive: false,
      prefixOnly: false,
    })
  })

  it('switches backends and resets form values', async () => {
    const w = await mountView([backend('a', { cacheConfig: enabledConfig }), backend('b')])
    expect(w.find('#cache-ttl').exists()).toBe(true)
    await w.find('#backend-select').setValue('b')
    await flushPromises()
    expect(w.find('#cache-ttl').exists()).toBe(false)
    await w.find('#backend-select').setValue('')
    expect(w.text()).not.toContain('Backend Configuration')
  })

  it('enabling caching with no existing cache triggers an initial refresh', async () => {
    const w = await mountView([backend('a')])
    cacheStore.refreshCache.mockImplementation(async () => withCache(true))
    const enable = w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Enable caching for this backend'))!
      .find('input')
    await enable.setValue(true)
    await flushPromises()
    expect(cacheStore.refreshCache).toHaveBeenCalledWith('a', false)
    expect(w.find('.save-message').text()).toBe('Cache refreshed successfully!')
    expect(w.find('.status-grid').exists()).toBe(true)

    await enable.setValue(false)
    await flushPromises()
    expect(w.find('.status-grid').exists()).toBe(false)
  })

  it('enabling caching when a cache exists just loads the browser', async () => {
    const w = await mountView([backend('a')])
    withCache(true)
    await w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Enable caching for this backend'))!
      .find('input')
      .setValue(true)
    await flushPromises()
    expect(cacheStore.refreshCache).not.toHaveBeenCalled()
    expect(cacheStore.searchElements).toHaveBeenCalled()
  })

  it('shows refresh failures', async () => {
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    expect(w.find('.no-cache-message').exists()).toBe(true)
    cacheStore.refreshCache.mockRejectedValue(new Error('endpoint down'))
    await w
      .findAll('button')
      .find((b) => b.text() === 'Refresh Cache Now')!
      .trigger('click')
    await flushPromises()
    expect(w.find('.save-message').text()).toBe('Failed to refresh cache: endpoint down')
  })

  it('clears the cache after confirmation, and handles cancel and failure', async () => {
    withCache(true)
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    const clear = () => w.findAll('button').find((b) => b.text() === 'Clear Cache')!

    confirmMock.mockReturnValueOnce(false)
    await clear().trigger('click')
    expect(cacheStore.invalidateCache).not.toHaveBeenCalled()

    cacheStore.invalidateCache.mockRejectedValueOnce(new Error('locked'))
    await clear().trigger('click')
    await flushPromises()
    expect(w.find('.save-message').text()).toBe('Failed to clear cache: locked')

    await clear().trigger('click')
    await flushPromises()
    expect(cacheStore.invalidateCache).toHaveBeenCalledWith('a')
    expect(w.find('.save-message').text()).toBe('Cache cleared successfully!')
    expect(w.find('.no-cache-message').exists()).toBe(true)
  })

  it('saves the backend cache config via the connection store', async () => {
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await w.find('#cache-ttl').setValue('48')
    await w.find('#max-elements').setValue('9000')
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith(
      'a',
      {
        cacheConfig: {
          enabled: true,
          ttl: 48 * 3600000,
          maxElements: 9000,
          queries: { classes: 'SELECT C', properties: 'SELECT P', individuals: 'SELECT I' },
        },
      },
      undefined
    )
  })

  it('reset restores defaults for global and backend settings', async () => {
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reset All to Defaults')!
      .trigger('click')
    expect(w.find('#cache-ttl').exists()).toBe(false)
    expect(w.find('.save-message').text()).toContain('Reset to default values')
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(api.update.mock.calls[0][1].cacheConfig).toMatchObject({
      enabled: false,
      ttl: 24 * 3600000,
      maxElements: 50000,
      queries: DEFAULT_CACHE_CONFIG.queries,
    })
  })

  it('logs and survives stats loading failure', async () => {
    cacheStore.validateCache.mockRejectedValue(new Error('idb'))
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    expect(console.error).toHaveBeenCalledWith('Failed to load cache stats:', expect.any(Error))
    expect(w.find('.no-cache-message').exists()).toBe(true)
  })

  it('shows an error when the backend cache config update fails', async () => {
    api.update.mockRejectedValueOnce(new Error('backend store locked'))
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    const message = w.find('.save-message')
    expect(message.text()).toBe('Failed to save settings: backend store locked')
    expect(message.text()).not.toContain('successfully')
    expect(message.classes()).toContain('error')
    // Global settings are not persisted when the backend update fails
    expect(localStorage.getItem('shiny:settings:cache')).toBeNull()
  })
})

describe('CacheSettingsView - SPARQL queries', () => {
  async function openQueries() {
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await section(w, 'SPARQL Queries').trigger('click')
    return w
  }

  it('tests each query and shows valid/invalid results', async () => {
    const w = await openQueries()
    const testButtons = () => w.findAll('button').filter((b) => b.text() === 'Test Query')
    api.testQuery.mockResolvedValueOnce({ valid: true, resultCount: 12 })
    await testButtons()[0].trigger('click')
    await flushPromises()
    expect(api.testQuery).toHaveBeenCalledWith('a', 'SELECT C')
    expect(w.findAll('.test-result')[0].text()).toBe('✓ Valid (12 results)')

    api.testQuery.mockResolvedValueOnce({ valid: false, error: 'Parse error' })
    await testButtons()[1].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('✗ Parse error')

    api.testQuery.mockRejectedValueOnce(new Error('IPC failed'))
    await testButtons()[2].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('✗ IPC failed')
  })

  it('edits and resets queries to defaults', async () => {
    const w = await openQueries()
    const areas = w.findAll('.query-textarea')
    expect((areas[0].element as HTMLTextAreaElement).value).toBe('SELECT C')
    api.testQuery.mockResolvedValue({ valid: true, resultCount: 1 })
    await w
      .findAll('button')
      .filter((b) => b.text() === 'Test Query')[0]
      .trigger('click')
    await flushPromises()

    const resets = w.findAll('button').filter((b) => b.text() === 'Reset to Default')
    for (const r of resets) await r.trigger('click')
    const values = w.findAll('.query-textarea').map((a) => (a.element as HTMLTextAreaElement).value)
    expect(values).toEqual([
      DEFAULT_CACHE_CONFIG.queries.classes,
      DEFAULT_CACHE_CONFIG.queries.properties,
      DEFAULT_CACHE_CONFIG.queries.individuals,
    ])
    expect(w.findAll('.test-result')).toHaveLength(0)
  })
})

describe('CacheSettingsView - element browser', () => {
  async function openBrowser() {
    withCache(true)
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await section(w, 'Cached Elements Browser').trigger('click')
    return w
  }

  it('lists elements with labels, fallbacks and metadata', async () => {
    const w = await openBrowser()
    const items = w.findAll('.element-item')
    expect(items).toHaveLength(4)
    expect(items[0].find('.element-label').text()).toBe('Person')
    expect(items[0].find('.element-description').text()).toBe('A human')
    expect(items[1].find('.element-label').text()).toBe('Thing')
    expect(items[3].find('.element-label').text()).toBe('Unnamed')
    expect(items[2].text()).toContain('object')
    expect(items[2].text()).toContain('domain: 1')
    expect(items[3].text()).toContain('types: 1')
    const filters = w.findAll('.filter-btn').map((b) => b.text())
    expect(filters).toEqual(['📦 Classes (2)', '🔗 Properties (1)', '🎯 Individuals (1)'])
    expect(w.find('.load-more').exists()).toBe(false)
  })

  it('copies an IRI on click and reports failures', async () => {
    const w = await openBrowser()
    await w.findAll('.element-item')[0].trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('http://ex.org/Person')
    expect(w.find('.copy-notification').text()).toBe('✓ Copied: Person')
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(w.find('.copy-notification').exists()).toBe(false)

    writeText.mockRejectedValueOnce(new Error('denied'))
    await w.findAll('.element-item')[1].trigger('click')
    await flushPromises()
    expect(w.find('.copy-notification').text()).toBe('✗ Failed to copy')
    expect(w.find('.copy-notification').classes()).toContain('error')
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(w.find('.copy-notification').exists()).toBe(false)
  })

  it('toggles type filters and re-queries', async () => {
    const w = await openBrowser()
    cacheStore.searchElements.mockClear()
    await w.findAll('.filter-btn')[0].trigger('click')
    await flushPromises()
    expect(cacheStore.searchElements).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ types: ['property', 'individual'] })
    )
    expect(w.findAll('.filter-btn')[0].classes()).not.toContain('active')
    await w.findAll('.filter-btn')[1].trigger('click')
    await w.findAll('.filter-btn')[2].trigger('click')
    await flushPromises()
    expect(cacheStore.searchElements).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ types: undefined })
    )
    await w.findAll('.filter-btn')[0].trigger('click')
    await flushPromises()
    expect(cacheStore.searchElements).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ types: ['class'] })
    )
  })

  it('debounces search input and shows the empty state', async () => {
    const w = await openBrowser()
    cacheStore.searchElements.mockClear()
    cacheStore.searchElements.mockResolvedValue([])
    await w.find('.search-input').setValue('pers')
    await w.find('.search-input').setValue('perso')
    expect(cacheStore.searchElements).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    await flushPromises()
    expect(cacheStore.searchElements).toHaveBeenCalledTimes(1)
    expect(cacheStore.searchElements).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ query: 'perso', limit: 50 })
    )
    expect(w.find('.browser-empty').exists()).toBe(true)
  })

  it('loads more elements when more are cached than shown', async () => {
    withCache(true)
    cacheStore.getStats.mockResolvedValue({ ...STATS, totalCount: 100 })
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    await section(w, 'Cached Elements Browser').trigger('click')
    const loadMore = w.find('.load-more button')
    expect(loadMore.exists()).toBe(true)
    await loadMore.trigger('click')
    await flushPromises()
    expect(cacheStore.searchElements).toHaveBeenLastCalledWith(
      'a',
      expect.objectContaining({ limit: 100 })
    )
  })

  it('shows empty list when search throws', async () => {
    const w = await openBrowser()
    cacheStore.searchElements.mockRejectedValue(new Error('idb'))
    await w.findAll('.filter-btn')[0].trigger('click')
    await flushPromises()
    expect(w.find('.browser-empty').exists()).toBe(true)
  })

  it('formats last-updated timestamps', async () => {
    withCache(true)
    const cases: [number, string][] = [
      [NOW - 10_000, 'Just now'],
      [NOW - 60_000, '1 minute ago'],
      [NOW - 5 * 60_000, '5 minutes ago'],
      [NOW - 3600_000, '1 hour ago'],
      [NOW - 86400_000, '1 day ago'],
      [NOW - 3 * 86400_000, '3 days ago'],
    ]
    for (const [ts, label] of cases) {
      cacheStore.getCache.mockResolvedValue({ metadata: { lastUpdated: ts } })
      const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
      expect(w.find('.status-grid').text()).toContain(`Last Updated:${label}`)
      w.unmount()
    }
    cacheStore.getCache.mockResolvedValue(null)
    const w = await mountView([backend('a', { cacheConfig: enabledConfig })])
    expect(w.find('.status-grid').text()).toContain('Last Updated:Never')
  })
})
