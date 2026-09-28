import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useQueryStore } from '../query'
import { useTabsStore } from '../tabs'
import { useConnectionStore } from '../connection'
import { useHistoryStore } from '../history'
import type { BackendConfig } from '../../types/backends'
import { getViewPreference, setViewPreference } from '@/services/preferences/viewPreferences'

vi.mock('@/services/preferences/viewPreferences', () => ({
  getViewPreference: vi.fn((type: string) =>
    type === 'select' ? 'json' : type === 'construct' ? 'turtle' : 'badge'
  ),
  setViewPreference: vi.fn(),
}))

const backend: BackendConfig = {
  id: 'b1',
  name: 'My Backend',
  type: 'sparql-1.1',
  endpoint: 'http://localhost:3030/ds',
  authType: 'none',
  createdAt: 0,
  updatedAt: 0,
}

let execute: ReturnType<typeof vi.fn>

function installLocalStorage() {
  const data = new Map<string, string>()
  const mock = {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, String(v))
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k)
    }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn(),
    length: 0,
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

describe('useQueryStore', () => {
  beforeEach(() => {
    installLocalStorage()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    execute = vi.fn()
    ;(window as any).electronAPI = { query: { execute } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setup(opts: { query?: string; backendId?: string | null } = {}) {
    const tabs = useTabsStore()
    const connection = useConnectionStore()
    connection.backends = [backend]
    const tabId = tabs.createTab({
      query: opts.query ?? 'SELECT * WHERE { ?s ?p ?o }',
      backendId: opts.backendId === undefined ? 'b1' : opts.backendId,
    })
    const store = useQueryStore()
    const history = useHistoryStore()
    return { tabs, connection, store, history, tabId }
  }

  describe('without an active tab', () => {
    it('exposes safe defaults', () => {
      const store = useQueryStore()
      expect(store.currentQuery).toBe('')
      expect(store.results).toBeNull()
      expect(store.error).toBeNull()
      expect(store.isExecuting).toBe(false)
      expect(store.queryType).toBeNull()
      expect(store.selectedBackend).toBeNull()
    })

    it('ignores writes and does not execute', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = useQueryStore()
      store.currentQuery = 'x'
      store.setQuery('y')
      expect(store.currentQuery).toBe('')
      await store.executeQuery()
      expect(execute).not.toHaveBeenCalled()
      expect(err).toHaveBeenCalledWith('No active tab')
    })
  })

  describe('proxying to active tab', () => {
    it('reads and writes currentQuery via the tab', () => {
      const { store, tabs, tabId } = setup({ query: 'ASK {}' })
      expect(store.currentQuery).toBe('ASK {}')
      store.currentQuery = 'SELECT 1'
      expect(tabs.getTab(tabId)?.query).toBe('SELECT 1')
      store.setQuery('SELECT 2')
      expect(tabs.getTab(tabId)?.query).toBe('SELECT 2')
      expect(tabs.getTab(tabId)?.isDirty).toBe(true)
    })

    it('resolves selectedBackend from the tab backend id', () => {
      const { store, tabs, tabId } = setup()
      expect(store.selectedBackend?.name).toBe('My Backend')
      tabs.setTabBackend(tabId, 'unknown')
      expect(store.selectedBackend).toBeNull()
      tabs.setTabBackend(tabId, null)
      expect(store.selectedBackend).toBeNull()
    })

    it('follows the active tab when switching', () => {
      const { store, tabs, tabId } = setup({ query: 'first' })
      tabs.createTab({ query: 'second' })
      expect(store.currentQuery).toBe('second')
      tabs.setActiveTab(tabId)
      expect(store.currentQuery).toBe('first')
    })
  })

  describe('executeQuery validation', () => {
    it('rejects empty queries', async () => {
      const { store, history } = setup({ query: '   ' })
      await store.executeQuery()
      expect(store.error).toBe('Query cannot be empty')
      expect(execute).not.toHaveBeenCalled()
      expect(history.entries).toHaveLength(0)
    })

    it('requires a backend', async () => {
      const { store } = setup({ backendId: null })
      await store.executeQuery()
      expect(store.error).toBe('No backend selected. Please select a backend.')
      expect(execute).not.toHaveBeenCalled()
    })
  })

  describe('executeQuery success', () => {
    it('stores SELECT results and records history with binding count', async () => {
      const response = {
        queryType: 'SELECT',
        data: { results: { bindings: [{}, {}, {}] } },
      }
      let resolve!: (v: unknown) => void
      execute.mockReturnValue(new Promise((r) => (resolve = r)))
      const { store, history } = setup()

      const p = store.executeQuery()
      expect(store.isExecuting).toBe(true)
      resolve(response)
      await p

      expect(execute).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', 'b1')
      expect(store.isExecuting).toBe(false)
      expect(store.results).toEqual(response)
      expect(store.queryType).toBe('SELECT')
      expect(store.error).toBeNull()
      expect(history.entries).toHaveLength(1)
      expect(history.entries[0]).toMatchObject({
        query: 'SELECT * WHERE { ?s ?p ?o }',
        backendId: 'b1',
        backendName: 'My Backend',
        resultCount: 3,
        queryType: 'SELECT',
        success: true,
        error: null,
      })
      expect(history.entries[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('uses null count for SELECT without bindings', async () => {
      execute.mockResolvedValue({ queryType: 'SELECT', data: {} })
      const { store, history } = setup()
      await store.executeQuery()
      expect(history.entries[0].resultCount).toBeNull()
    })

    it('counts ASK as 1 and CONSTRUCT as null', async () => {
      const { store, history } = setup()
      execute.mockResolvedValueOnce({ queryType: 'ASK', data: { boolean: true } })
      await store.executeQuery()
      expect(history.entries[0].resultCount).toBe(1)

      execute.mockResolvedValueOnce({ queryType: 'CONSTRUCT', data: '<a> <b> <c> .' })
      await store.executeQuery()
      expect(history.entries[0].resultCount).toBeNull()
      expect(history.entries[0].queryType).toBe('CONSTRUCT')
    })

    it('records "Unknown" backend name when backend config is missing', async () => {
      execute.mockResolvedValue({ queryType: 'ASK', data: {} })
      const { store, history, tabs, tabId } = setup()
      tabs.setTabBackend(tabId, 'ghost')
      await store.executeQuery()
      expect(execute).toHaveBeenCalledWith(expect.any(String), 'ghost')
      expect(history.entries[0].backendName).toBe('Unknown')
    })
  })

  describe('executeQuery failure', () => {
    it('sets tab error and records failed history entry', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      execute.mockRejectedValue(new Error('Connection refused'))
      const { store, history } = setup()
      await store.executeQuery()
      expect(store.error).toBe('Connection refused')
      expect(store.results).toBeNull()
      expect(store.isExecuting).toBe(false)
      expect(history.entries[0]).toMatchObject({
        success: false,
        error: 'Connection refused',
        resultCount: null,
        queryType: null,
        backendName: 'My Backend',
      })
    })

    it('uses a fallback message when error has none', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      execute.mockRejectedValue({})
      const { store, history } = setup()
      await store.executeQuery()
      expect(store.error).toBe('Failed to execute query')
      expect(history.entries[0].error).toBe('Failed to execute query')
    })
  })

  describe('view preferences', () => {
    it('initialises from stored preferences', () => {
      const store = useQueryStore()
      expect(getViewPreference).toHaveBeenCalledWith('select')
      expect(store.currentSelectView).toBe('json')
      expect(store.currentConstructView).toBe('turtle')
      expect(store.currentAskView).toBe('badge')
    })

    it('updates and persists each view', () => {
      const store = useQueryStore()
      store.setSelectView('table')
      store.setConstructView('jsonld')
      store.setAskView('json')
      expect(store.currentSelectView).toBe('table')
      expect(store.currentConstructView).toBe('jsonld')
      expect(store.currentAskView).toBe('json')
      expect(setViewPreference).toHaveBeenCalledWith('select', 'table')
      expect(setViewPreference).toHaveBeenCalledWith('construct', 'jsonld')
      expect(setViewPreference).toHaveBeenCalledWith('ask', 'json')
    })
  })
})
