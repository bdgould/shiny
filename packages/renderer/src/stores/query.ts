import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QueryType } from '@/services/sparql/queryDetector'
import {
  getViewPreference,
  setViewPreference,
  type SelectView,
  type ConstructView,
  type AskView,
} from '@/services/preferences/viewPreferences'
import { useTabsStore } from './tabs'
import { useConnectionStore } from './connection'
import { useHistoryStore } from './history'

/**
 * Query store - now acts as a compatibility layer that proxies to the active tab
 *
 * This maintains backward compatibility with existing components while
 * delegating all state management to the tabs store.
 */
export const useQueryStore = defineStore('query', () => {
  const tabsStore = useTabsStore()

  // Computed properties that proxy to active tab
  const currentQuery = computed({
    get: () => tabsStore.activeTab?.query ?? '',
    set: (value: string) => {
      if (tabsStore.activeTab) {
        tabsStore.updateTabQuery(tabsStore.activeTab.id, value)
      }
    },
  })

  const results = computed(() => tabsStore.activeTab?.results ?? null)
  const error = computed(() => tabsStore.activeTab?.error ?? null)
  const isExecuting = computed(() => tabsStore.activeTab?.isExecuting ?? false)
  const queryType = computed(() => tabsStore.activeTab?.queryType ?? null)

  // Backend selection is now per-tab
  const selectedBackend = computed(() => {
    const backendId = tabsStore.activeTab?.backendId
    if (!backendId) return null

    // Get the backend from connection store
    const connectionStore = useConnectionStore()
    return connectionStore.backends.find((b: any) => b.id === backendId) || null
  })

  // View preferences remain global (not per-tab)
  const currentSelectView = ref<SelectView>(getViewPreference('select'))
  const currentConstructView = ref<ConstructView>(getViewPreference('construct'))
  const currentAskView = ref<AskView>(getViewPreference('ask'))

  async function executeQuery() {
    const activeTab = tabsStore.activeTab
    if (!activeTab) {
      console.error('No active tab')
      return
    }

    if (!activeTab.query.trim()) {
      tabsStore.setTabError(activeTab.id, 'Query cannot be empty')
      return
    }

    // Check if a backend is selected for this tab
    if (!activeTab.backendId) {
      tabsStore.setTabError(activeTab.id, 'No backend selected. Please select a backend.')
      return
    }

    const connectionStore = useConnectionStore()
    const historyStore = useHistoryStore()
    const backend = connectionStore.backends.find((b: any) => b.id === activeTab.backendId)
    const backendName = backend?.name || 'Unknown'

    tabsStore.setTabExecuting(activeTab.id, true)
    const startTime = Date.now()

    try {
      // Use the Electron API to execute the query with selected backend
      const response = await window.electronAPI.query.execute(activeTab.query, activeTab.backendId)
      const duration = Date.now() - startTime

      tabsStore.setTabResults(activeTab.id, response, response.queryType as QueryType)

      // Calculate result count
      let resultCount: number | null = null
      if (response.queryType === 'SELECT' && response.bindings) {
        resultCount = response.bindings.length
      } else if (response.queryType === 'ASK') {
        resultCount = 1
      } else if (response.queryType === 'CONSTRUCT' || response.queryType === 'DESCRIBE') {
        // For CONSTRUCT/DESCRIBE, count triples if available
        if (response.triples) {
          resultCount = response.triples.length
        }
      }

      // Add to history
      historyStore.addEntry({
        query: activeTab.query,
        backendId: activeTab.backendId,
        backendName,
        executedAt: Date.now(),
        duration,
        resultCount,
        queryType: response.queryType as QueryType,
        success: true,
        error: null,
      })
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to execute query'
      const duration = Date.now() - startTime

      tabsStore.setTabError(activeTab.id, errorMessage)
      console.error('Query execution error:', err)

      // Add failed query to history
      historyStore.addEntry({
        query: activeTab.query,
        backendId: activeTab.backendId,
        backendName,
        executedAt: Date.now(),
        duration,
        resultCount: null,
        queryType: null,
        success: false,
        error: errorMessage,
      })
    } finally {
      tabsStore.setTabExecuting(activeTab.id, false)
    }
  }

  function setQuery(query: string) {
    if (tabsStore.activeTab) {
      tabsStore.updateTabQuery(tabsStore.activeTab.id, query)
    }
  }

  function setSelectView(view: SelectView) {
    currentSelectView.value = view
    setViewPreference('select', view)
  }

  function setConstructView(view: ConstructView) {
    currentConstructView.value = view
    setViewPreference('construct', view)
  }

  function setAskView(view: AskView) {
    currentAskView.value = view
    setViewPreference('ask', view)
  }

  return {
    currentQuery,
    results,
    error,
    isExecuting,
    queryType,
    currentSelectView,
    currentConstructView,
    currentAskView,
    selectedBackend,
    executeQuery,
    setQuery,
    setSelectView,
    setConstructView,
    setAskView,
  }
})
