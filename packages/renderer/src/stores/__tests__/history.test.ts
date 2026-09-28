import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useHistoryStore, type QueryHistoryEntry } from '../history'

const STORAGE_KEY = 'shiny-query-history'

function makeEntry(overrides: Partial<Omit<QueryHistoryEntry, 'id'>> = {}) {
  return {
    query: 'SELECT * WHERE { ?s ?p ?o }',
    backendId: 'b1',
    backendName: 'Backend 1',
    executedAt: 1000,
    duration: 12,
    resultCount: 3,
    queryType: 'SELECT' as const,
    success: true,
    error: null,
    ...overrides,
  }
}

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

describe('useHistoryStore', () => {
  beforeEach(() => {
    installLocalStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts empty', () => {
    const store = useHistoryStore()
    expect(store.entries).toEqual([])
    expect(store.sortedEntries).toEqual([])
  })

  describe('addEntry', () => {
    it('adds entry with generated id and persists it', () => {
      const store = useHistoryStore()
      store.addEntry(makeEntry())
      expect(store.entries).toHaveLength(1)
      expect(store.entries[0].id).toEqual(expect.any(String))
      expect(store.entries[0].id.length).toBeGreaterThan(0)
      expect(store.entries[0].query).toContain('SELECT')

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      expect(persisted).toHaveLength(1)
      expect(persisted[0].id).toBe(store.entries[0].id)
    })

    it('prepends new entries and assigns unique ids', () => {
      const store = useHistoryStore()
      store.addEntry(makeEntry({ query: 'first' }))
      store.addEntry(makeEntry({ query: 'second' }))
      expect(store.entries.map((e) => e.query)).toEqual(['second', 'first'])
      expect(store.entries[0].id).not.toBe(store.entries[1].id)
    })

    it('caps history at 100 entries, dropping the oldest', () => {
      const store = useHistoryStore()
      for (let i = 0; i < 105; i++) {
        store.addEntry(makeEntry({ query: `q${i}` }))
      }
      expect(store.entries).toHaveLength(100)
      expect(store.entries[0].query).toBe('q104')
      expect(store.entries[99].query).toBe('q5')
    })

    it('logs but does not throw when persistence fails', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('quota')
      })
      const store = useHistoryStore()
      expect(() => store.addEntry(makeEntry())).not.toThrow()
      expect(store.entries).toHaveLength(1)
      expect(err).toHaveBeenCalled()
    })
  })

  it('sortedEntries orders by executedAt descending', () => {
    const store = useHistoryStore()
    store.addEntry(makeEntry({ query: 'mid', executedAt: 200 }))
    store.addEntry(makeEntry({ query: 'old', executedAt: 100 }))
    store.addEntry(makeEntry({ query: 'new', executedAt: 300 }))
    expect(store.sortedEntries.map((e) => e.query)).toEqual(['new', 'mid', 'old'])
    // Underlying array order is unchanged
    expect(store.entries.map((e) => e.query)).toEqual(['new', 'old', 'mid'])
  })

  it('getEntry returns entry or null', () => {
    const store = useHistoryStore()
    store.addEntry(makeEntry())
    const id = store.entries[0].id
    expect(store.getEntry(id)?.id).toBe(id)
    expect(store.getEntry('missing')).toBeNull()
  })

  describe('deleteEntry', () => {
    it('removes the matching entry and persists', () => {
      const store = useHistoryStore()
      store.addEntry(makeEntry({ query: 'a' }))
      store.addEntry(makeEntry({ query: 'b' }))
      const id = store.entries[0].id
      store.deleteEntry(id)
      expect(store.entries.map((e) => e.query)).toEqual(['a'])
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toHaveLength(1)
    })

    it('does nothing for unknown id', () => {
      const store = useHistoryStore()
      store.addEntry(makeEntry())
      const setItem = vi.mocked(localStorage.setItem)
      setItem.mockClear()
      store.deleteEntry('nope')
      expect(store.entries).toHaveLength(1)
      expect(setItem).not.toHaveBeenCalled()
    })
  })

  it('clearHistory empties entries and storage', () => {
    const store = useHistoryStore()
    store.addEntry(makeEntry())
    store.clearHistory()
    expect(store.entries).toEqual([])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual([])
  })

  describe('restoreFromLocalStorage', () => {
    it('loads stored entries', () => {
      const stored = [{ id: 'x', ...makeEntry() }]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const store = useHistoryStore()
      store.restoreFromLocalStorage()
      expect(store.entries).toEqual(stored)
    })

    it('keeps entries unchanged when nothing is stored', () => {
      const store = useHistoryStore()
      store.restoreFromLocalStorage()
      expect(store.entries).toEqual([])
    })

    it('resets to empty on corrupt data', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = useHistoryStore()
      store.addEntry(makeEntry())
      localStorage.setItem(STORAGE_KEY, '{not json')
      store.restoreFromLocalStorage()
      expect(store.entries).toEqual([])
      expect(err).toHaveBeenCalled()
    })
  })
})
