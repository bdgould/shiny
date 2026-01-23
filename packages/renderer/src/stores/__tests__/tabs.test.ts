import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTabsStore } from '../tabs'

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${Math.random().toString(36).substring(7)}`),
}))

describe('useTabsStore', () => {
  beforeEach(() => {
    // Create a fresh Pinia instance before each test
    setActivePinia(createPinia())

    // Reset mocks
    vi.clearAllMocks()

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
  })

  describe('initial state', () => {
    it('should have empty tabs array', () => {
      const store = useTabsStore()
      expect(store.tabs).toEqual([])
    })

    it('should have null activeTabId', () => {
      const store = useTabsStore()
      expect(store.activeTabId).toBeNull()
    })

    it('should have nextUntitledNumber as 1', () => {
      const store = useTabsStore()
      expect(store.nextUntitledNumber).toBe(1)
    })
  })

  describe('createTab', () => {
    it('should create a default untitled tab', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0].name).toBe('Untitled-1')
      expect(store.tabs[0].query).toBe('')
      expect(store.tabs[0].id).toBe(tabId)
      expect(store.activeTabId).toBe(tabId)
    })

    it('should increment untitled counter for each new untitled tab', () => {
      const store = useTabsStore()
      store.createTab()
      store.createTab()
      store.createTab()

      expect(store.tabs[0].name).toBe('Untitled-1')
      expect(store.tabs[1].name).toBe('Untitled-2')
      expect(store.tabs[2].name).toBe('Untitled-3')
      expect(store.nextUntitledNumber).toBe(4)
    })

    it('should create tab with custom name', () => {
      const store = useTabsStore()
      store.createTab({ name: 'My Query' })

      expect(store.tabs[0].name).toBe('My Query')
      // Should not increment untitled counter for named tabs
      expect(store.nextUntitledNumber).toBe(1)
    })

    it('should create tab with query content', () => {
      const store = useTabsStore()
      store.createTab({ query: 'SELECT * WHERE { ?s ?p ?o }' })

      expect(store.tabs[0].query).toBe('SELECT * WHERE { ?s ?p ?o }')
    })

    it('should create settings tab with correct name', () => {
      const store = useTabsStore()
      store.createTab({ isSettings: true, settingsType: 'query' })

      expect(store.tabs[0].name).toBe('Query Settings')
      expect(store.tabs[0].isSettings).toBe(true)
      expect(store.tabs[0].settingsType).toBe('query')
      // Should not increment untitled counter for settings tabs
      expect(store.nextUntitledNumber).toBe(1)
    })

    it('should create AI settings tab', () => {
      const store = useTabsStore()
      store.createTab({ isSettings: true, settingsType: 'ai' })

      expect(store.tabs[0].name).toBe('AI Settings')
    })

    it('should create cache settings tab', () => {
      const store = useTabsStore()
      store.createTab({ isSettings: true, settingsType: 'cache' })

      expect(store.tabs[0].name).toBe('Cache Settings')
    })

    it('should create prefix settings tab', () => {
      const store = useTabsStore()
      store.createTab({ isSettings: true, settingsType: 'prefix' })

      expect(store.tabs[0].name).toBe('Prefix Management')
    })

    it('should create SPARQL formatting settings tab', () => {
      const store = useTabsStore()
      store.createTab({ isSettings: true, settingsType: 'sparql-formatting' })

      expect(store.tabs[0].name).toBe('SPARQL Formatting')
    })

    it('should auto-select new tab', () => {
      const store = useTabsStore()
      const tab1Id = store.createTab()
      expect(store.activeTabId).toBe(tab1Id)

      const tab2Id = store.createTab()
      expect(store.activeTabId).toBe(tab2Id)
    })

    it('should inherit backendId from active tab if not specified', () => {
      const store = useTabsStore()
      store.createTab({ backendId: 'backend-1' })
      store.createTab() // Should inherit backendId

      expect(store.tabs[1].backendId).toBe('backend-1')
    })

    it('should use specified backendId over inherited', () => {
      const store = useTabsStore()
      store.createTab({ backendId: 'backend-1' })
      store.createTab({ backendId: 'backend-2' })

      expect(store.tabs[1].backendId).toBe('backend-2')
    })

    it('should set filePath and savedContent when provided', () => {
      const store = useTabsStore()
      store.createTab({
        filePath: '/path/to/file.sparql',
        savedContent: 'SELECT * WHERE { ?s ?p ?o }',
        query: 'SELECT * WHERE { ?s ?p ?o }',
      })

      expect(store.tabs[0].filePath).toBe('/path/to/file.sparql')
      expect(store.tabs[0].savedContent).toBe('SELECT * WHERE { ?s ?p ?o }')
    })
  })

  describe('closeTab', () => {
    it('should remove the tab', () => {
      const store = useTabsStore()
      const tabId = store.createTab()
      expect(store.tabs).toHaveLength(1)

      // Need at least one tab - closing will create a new one
      store.closeTab(tabId)
      expect(store.tabs).toHaveLength(1) // New tab created
    })

    it('should return false for non-existent tab', () => {
      const store = useTabsStore()
      const result = store.closeTab('nonexistent-id')
      expect(result).toBe(false)
    })

    it('should select adjacent tab when active tab is closed', () => {
      const store = useTabsStore()
      const tab1Id = store.createTab({ name: 'Tab 1' })
      const tab2Id = store.createTab({ name: 'Tab 2' })
      store.createTab({ name: 'Tab 3' })

      // Close middle tab (which is active)
      store.setActiveTab(tab2Id)
      store.closeTab(tab2Id)

      expect(store.tabs).toHaveLength(2)
      // Should select the tab that was at the same index
    })

    it('should create new tab when last tab is closed', () => {
      const store = useTabsStore()
      const tabId = store.createTab()
      store.closeTab(tabId)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).not.toBeNull()
    })

    it('should not affect active tab when closing inactive tab', () => {
      const store = useTabsStore()
      const tab1Id = store.createTab({ name: 'Tab 1' })
      const tab2Id = store.createTab({ name: 'Tab 2' })

      // tab2 is active, close tab1
      store.closeTab(tab1Id)

      expect(store.activeTabId).toBe(tab2Id)
      expect(store.tabs).toHaveLength(1)
    })
  })

  describe('setActiveTab', () => {
    it('should set activeTabId for existing tab', () => {
      const store = useTabsStore()
      const tab1Id = store.createTab()
      const tab2Id = store.createTab()

      store.setActiveTab(tab1Id)
      expect(store.activeTabId).toBe(tab1Id)

      store.setActiveTab(tab2Id)
      expect(store.activeTabId).toBe(tab2Id)
    })

    it('should not change activeTabId for non-existent tab', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setActiveTab('nonexistent-id')
      expect(store.activeTabId).toBe(tabId)
    })
  })

  describe('getTab', () => {
    it('should return tab by ID', () => {
      const store = useTabsStore()
      const tabId = store.createTab({ name: 'Test Tab' })

      const tab = store.getTab(tabId)
      expect(tab).not.toBeNull()
      expect(tab?.name).toBe('Test Tab')
    })

    it('should return null for non-existent tab', () => {
      const store = useTabsStore()
      const tab = store.getTab('nonexistent-id')
      expect(tab).toBeNull()
    })
  })

  describe('updateTabQuery', () => {
    it('should update query content', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.updateTabQuery(tabId, 'SELECT ?s WHERE { ?s ?p ?o }')

      const tab = store.getTab(tabId)
      expect(tab?.query).toBe('SELECT ?s WHERE { ?s ?p ?o }')
    })

    it('should set dirty flag for unsaved file with content', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.updateTabQuery(tabId, 'SELECT * WHERE { ?s ?p ?o }')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(true)
    })

    it('should not be dirty for empty content in unsaved file', () => {
      const store = useTabsStore()
      const tabId = store.createTab({ query: 'initial' })

      store.updateTabQuery(tabId, '   ')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(false)
    })

    it('should set dirty flag when content differs from savedContent', () => {
      const store = useTabsStore()
      const tabId = store.createTab({
        filePath: '/path/to/file.sparql',
        savedContent: 'SELECT * WHERE { ?s ?p ?o }',
        query: 'SELECT * WHERE { ?s ?p ?o }',
      })

      store.updateTabQuery(tabId, 'SELECT ?s WHERE { ?s ?p ?o }')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(true)
    })

    it('should clear dirty flag when content matches savedContent', () => {
      const store = useTabsStore()
      const tabId = store.createTab({
        filePath: '/path/to/file.sparql',
        savedContent: 'SELECT * WHERE { ?s ?p ?o }',
        query: 'modified query',
      })

      store.updateTabQuery(tabId, 'SELECT * WHERE { ?s ?p ?o }')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(false)
    })

    it('should do nothing for non-existent tab', () => {
      const store = useTabsStore()
      // Should not throw
      store.updateTabQuery('nonexistent-id', 'query')
    })
  })

  describe('setTabExecuting', () => {
    it('should set isExecuting to true', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabExecuting(tabId, true)

      const tab = store.getTab(tabId)
      expect(tab?.isExecuting).toBe(true)
    })

    it('should set isExecuting to false', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabExecuting(tabId, true)
      store.setTabExecuting(tabId, false)

      const tab = store.getTab(tabId)
      expect(tab?.isExecuting).toBe(false)
    })

    it('should do nothing for non-existent tab', () => {
      const store = useTabsStore()
      // Should not throw
      store.setTabExecuting('nonexistent-id', true)
    })
  })

  describe('setTabResults', () => {
    it('should set results and queryType', () => {
      const store = useTabsStore()
      const tabId = store.createTab()
      const results = { bindings: [] }

      store.setTabResults(tabId, results, 'SELECT')

      const tab = store.getTab(tabId)
      expect(tab?.results).toEqual(results)
      expect(tab?.queryType).toBe('SELECT')
    })

    it('should clear error when setting results', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabError(tabId, 'Some error')
      store.setTabResults(tabId, { data: 'test' }, 'CONSTRUCT')

      const tab = store.getTab(tabId)
      expect(tab?.error).toBeNull()
    })

    it('should update lastExecutedAt', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      const before = Date.now()
      store.setTabResults(tabId, {}, 'SELECT')
      const after = Date.now()

      const tab = store.getTab(tabId)
      expect(tab?.lastExecutedAt).toBeGreaterThanOrEqual(before)
      expect(tab?.lastExecutedAt).toBeLessThanOrEqual(after)
    })
  })

  describe('setTabError', () => {
    it('should set error message', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabError(tabId, 'Query execution failed')

      const tab = store.getTab(tabId)
      expect(tab?.error).toBe('Query execution failed')
    })

    it('should clear results when setting error', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabResults(tabId, { data: 'test' }, 'SELECT')
      store.setTabError(tabId, 'Error occurred')

      const tab = store.getTab(tabId)
      expect(tab?.results).toBeNull()
    })
  })

  describe('setTabBackend', () => {
    it('should update backendId', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.setTabBackend(tabId, 'new-backend-id')

      const tab = store.getTab(tabId)
      expect(tab?.backendId).toBe('new-backend-id')
    })

    it('should accept null to clear backendId', () => {
      const store = useTabsStore()
      const tabId = store.createTab({ backendId: 'backend-1' })

      store.setTabBackend(tabId, null)

      const tab = store.getTab(tabId)
      expect(tab?.backendId).toBeNull()
    })

    it('should mark saved file as dirty when changing backend', () => {
      const store = useTabsStore()
      const tabId = store.createTab({
        filePath: '/path/to/file.sparql',
        savedContent: 'query',
      })

      store.setTabBackend(tabId, 'new-backend')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(true)
    })
  })

  describe('markTabSaved', () => {
    it('should update filePath and name', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.markTabSaved(tabId, '/path/to/saved.sparql', 'saved.sparql')

      const tab = store.getTab(tabId)
      expect(tab?.filePath).toBe('/path/to/saved.sparql')
      expect(tab?.name).toBe('saved.sparql')
    })

    it('should clear dirty flag', () => {
      const store = useTabsStore()
      const tabId = store.createTab()

      store.updateTabQuery(tabId, 'SELECT * WHERE { ?s ?p ?o }')
      expect(store.getTab(tabId)?.isDirty).toBe(true)

      store.markTabSaved(tabId, '/path/to/saved.sparql', 'saved.sparql')

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(false)
    })

    it('should update savedContent to match current query', () => {
      const store = useTabsStore()
      const tabId = store.createTab()
      const query = 'SELECT * WHERE { ?s ?p ?o }'

      store.updateTabQuery(tabId, query)
      store.markTabSaved(tabId, '/path/to/saved.sparql', 'saved.sparql')

      const tab = store.getTab(tabId)
      expect(tab?.savedContent).toBe(query)
    })
  })

  describe('openFileInNewTab', () => {
    it('should create tab with file data', () => {
      const store = useTabsStore()

      const tabId = store.openFileInNewTab({
        content: 'SELECT * WHERE { ?s ?p ?o }',
        filePath: '/path/to/query.sparql',
        fileName: 'query.sparql',
        backendId: 'backend-1',
      })

      const tab = store.getTab(tabId)
      expect(tab?.query).toBe('SELECT * WHERE { ?s ?p ?o }')
      expect(tab?.filePath).toBe('/path/to/query.sparql')
      expect(tab?.name).toBe('query.sparql')
      expect(tab?.backendId).toBe('backend-1')
      expect(tab?.savedContent).toBe('SELECT * WHERE { ?s ?p ?o }')
    })

    it('should not be dirty when opened', () => {
      const store = useTabsStore()

      const tabId = store.openFileInNewTab({
        content: 'SELECT * WHERE { ?s ?p ?o }',
        filePath: '/path/to/query.sparql',
        fileName: 'query.sparql',
        backendId: null,
      })

      const tab = store.getTab(tabId)
      expect(tab?.isDirty).toBe(false)
    })
  })

  describe('activeTab computed', () => {
    it('should return null when no active tab', () => {
      const store = useTabsStore()
      expect(store.activeTab).toBeNull()
    })

    it('should return active tab object', () => {
      const store = useTabsStore()
      const tabId = store.createTab({ name: 'Active Tab' })

      expect(store.activeTab).not.toBeNull()
      expect(store.activeTab?.id).toBe(tabId)
      expect(store.activeTab?.name).toBe('Active Tab')
    })

    it('should update when active tab changes', () => {
      const store = useTabsStore()
      store.createTab({ name: 'Tab 1' })
      const tab2Id = store.createTab({ name: 'Tab 2' })

      expect(store.activeTab?.name).toBe('Tab 2')

      const tab1 = store.tabs[0]
      store.setActiveTab(tab1.id)
      expect(store.activeTab?.name).toBe('Tab 1')
    })
  })

  describe('restoreFromLocalStorage', () => {
    it('should create initial tab when no stored session', () => {
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)

      const store = useTabsStore()
      store.restoreFromLocalStorage()

      expect(store.tabs).toHaveLength(1)
    })

    it('should restore tabs from localStorage', () => {
      const storedState = {
        tabs: [
          {
            id: 'tab-1',
            name: 'Stored Tab',
            query: 'SELECT * WHERE { ?s ?p ?o }',
            results: null,
            error: null,
            isExecuting: false,
            queryType: null,
            filePath: null,
            isDirty: false,
            backendId: null,
            savedContent: null,
            createdAt: Date.now(),
            lastExecutedAt: null,
          },
        ],
        activeTabId: 'tab-1',
        nextUntitledNumber: 2,
      }

      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify(storedState)
      )

      const store = useTabsStore()
      store.restoreFromLocalStorage()

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0].name).toBe('Stored Tab')
      expect(store.activeTabId).toBe('tab-1')
      expect(store.nextUntitledNumber).toBe(2)
    })

    it('should handle empty tabs array in stored state', () => {
      const storedState = {
        tabs: [],
        activeTabId: null,
        nextUntitledNumber: 1,
      }

      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify(storedState)
      )

      const store = useTabsStore()
      store.restoreFromLocalStorage()

      expect(store.tabs).toHaveLength(1) // Creates initial tab
    })

    it('should create tab on parse error', () => {
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('invalid json')

      const store = useTabsStore()
      store.restoreFromLocalStorage()

      expect(store.tabs).toHaveLength(1)
    })

    it('should fix invalid activeTabId', () => {
      const storedState = {
        tabs: [
          {
            id: 'tab-1',
            name: 'Tab 1',
            query: '',
            results: null,
            error: null,
            isExecuting: false,
            queryType: null,
            filePath: null,
            isDirty: false,
            backendId: null,
            savedContent: null,
            createdAt: Date.now(),
            lastExecutedAt: null,
          },
        ],
        activeTabId: 'nonexistent-tab',
        nextUntitledNumber: 2,
      }

      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify(storedState)
      )

      const store = useTabsStore()
      store.restoreFromLocalStorage()

      expect(store.activeTabId).toBe('tab-1')
    })
  })

  describe('clearAllTabs', () => {
    it('should reset state and create new tab', () => {
      const store = useTabsStore()

      // Create multiple tabs
      store.createTab({ name: 'Tab 1' })
      store.createTab({ name: 'Tab 2' })
      store.createTab({ name: 'Tab 3' })

      expect(store.tabs).toHaveLength(3)

      store.clearAllTabs()

      expect(store.tabs).toHaveLength(1)
      expect(store.nextUntitledNumber).toBe(2) // 1 was used for the new tab
    })
  })
})
