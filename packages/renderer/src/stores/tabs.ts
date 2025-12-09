import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { QueryType } from '@/services/sparql/queryDetector'
import { v4 as uuidv4 } from 'uuid'

export interface Tab {
  id: string
  name: string
  query: string
  results: any | null
  error: string | null
  isExecuting: boolean
  queryType: QueryType | null
  filePath: string | null
  isDirty: boolean
  backendId: string | null
  savedContent: string | null // For dirty checking
  createdAt: number
  lastExecutedAt: number | null
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
  nextUntitledNumber: number
}

const STORAGE_KEY = 'shiny-tabs-session'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const nextUntitledNumber = ref(1)

  // Computed: get active tab
  const activeTab = computed(() => {
    if (!activeTabId.value) return null
    return tabs.value.find((t) => t.id === activeTabId.value) || null
  })

  // Create a new tab
  function createTab(options?: {
    query?: string
    name?: string
    filePath?: string
    backendId?: string
    savedContent?: string
  }): string {
    const tab: Tab = {
      id: uuidv4(),
      name: options?.name || `Untitled-${nextUntitledNumber.value}`,
      query: options?.query || '',
      results: null,
      error: null,
      isExecuting: false,
      queryType: null,
      filePath: options?.filePath || null,
      isDirty: false,
      backendId: options?.backendId || activeTab.value?.backendId || null,
      savedContent: options?.savedContent || null,
      createdAt: Date.now(),
      lastExecutedAt: null,
    }

    tabs.value.push(tab)

    // Increment untitled counter if this was an untitled tab
    if (!options?.name) {
      nextUntitledNumber.value++
    }

    // Auto-select new tab
    activeTabId.value = tab.id

    return tab.id
  }

  // Close a tab
  function closeTab(tabId: string): boolean {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return false

    // Remove the tab
    tabs.value.splice(index, 1)

    // If we closed the active tab, select another
    if (activeTabId.value === tabId) {
      if (tabs.value.length === 0) {
        // Create a new empty tab if no tabs remain
        createTab()
      } else {
        // Select the tab at the same index (or the last tab if we were at the end)
        const newActiveIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newActiveIndex].id
      }
    }

    return true
  }

  // Set active tab
  function setActiveTab(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab) {
      activeTabId.value = tabId
    }
  }

  // Get tab by ID
  function getTab(tabId: string): Tab | null {
    return tabs.value.find((t) => t.id === tabId) || null
  }

  // Update tab query
  function updateTabQuery(tabId: string, newQuery: string) {
    const tab = getTab(tabId)
    if (!tab) return

    tab.query = newQuery

    // Update dirty flag
    if (tab.filePath && tab.savedContent !== null) {
      tab.isDirty = newQuery !== tab.savedContent
    } else {
      // New unsaved file - dirty if not empty
      tab.isDirty = newQuery.trim() !== ''
    }
  }

  // Update tab execution state
  function setTabExecuting(tabId: string, isExecuting: boolean) {
    const tab = getTab(tabId)
    if (!tab) return
    tab.isExecuting = isExecuting
  }

  // Update tab results
  function setTabResults(tabId: string, results: any, queryType: QueryType | null) {
    const tab = getTab(tabId)
    if (!tab) return

    tab.results = results
    tab.queryType = queryType
    tab.error = null
    tab.lastExecutedAt = Date.now()
  }

  // Update tab error
  function setTabError(tabId: string, error: string) {
    const tab = getTab(tabId)
    if (!tab) return

    tab.error = error
    tab.results = null
  }

  // Update tab backend
  function setTabBackend(tabId: string, backendId: string | null) {
    const tab = getTab(tabId)
    if (!tab) return

    tab.backendId = backendId

    // Mark as dirty if we had a saved backend different from the new one
    if (tab.filePath && tab.savedContent !== null) {
      // TODO: More sophisticated dirty checking that includes backend
      tab.isDirty = true
    }
  }

  // Save tab - update file path and clear dirty flag
  function markTabSaved(tabId: string, filePath: string, fileName: string) {
    const tab = getTab(tabId)
    if (!tab) return

    tab.filePath = filePath
    tab.name = fileName
    tab.savedContent = tab.query
    tab.isDirty = false
  }

  // Open file in new tab
  function openFileInNewTab(fileData: {
    content: string
    filePath: string
    fileName: string
    backendId: string | null
  }): string {
    return createTab({
      query: fileData.content,
      name: fileData.fileName,
      filePath: fileData.filePath,
      backendId: fileData.backendId,
      savedContent: fileData.content, // Saved content matches current content
    })
  }

  // Persist tabs to localStorage
  function persistToLocalStorage() {
    try {
      const state: TabsState = {
        tabs: tabs.value.map((tab) => ({
          ...tab,
          // Don't persist results - they can be huge
          results: null,
          error: null,
          isExecuting: false,
        })),
        activeTabId: activeTabId.value,
        nextUntitledNumber: nextUntitledNumber.value,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to persist tabs to localStorage:', error)
    }
  }

  // Restore tabs from localStorage
  function restoreFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        // No saved session - create initial tab
        createTab()
        return
      }

      const state: TabsState = JSON.parse(stored)

      if (state.tabs && state.tabs.length > 0) {
        tabs.value = state.tabs
        activeTabId.value = state.activeTabId
        nextUntitledNumber.value = state.nextUntitledNumber || 1

        // Ensure active tab exists
        if (!activeTabId.value || !tabs.value.find((t) => t.id === activeTabId.value)) {
          activeTabId.value = tabs.value[0].id
        }
      } else {
        // Empty or invalid state - create initial tab
        createTab()
      }
    } catch (error) {
      console.error('Failed to restore tabs from localStorage:', error)
      // Create a new tab on error
      createTab()
    }
  }

  // Clear all tabs (for testing)
  function clearAllTabs() {
    tabs.value = []
    activeTabId.value = null
    nextUntitledNumber.value = 1
    createTab()
  }

  // Watch for tab changes and persist (debounced)
  let persistTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    () => [tabs.value, activeTabId.value, nextUntitledNumber.value],
    () => {
      if (persistTimeout) clearTimeout(persistTimeout)
      persistTimeout = setTimeout(() => {
        persistToLocalStorage()
      }, 500)
    },
    { deep: true }
  )

  return {
    // State
    tabs,
    activeTabId,
    activeTab,
    nextUntitledNumber,

    // Actions
    createTab,
    closeTab,
    setActiveTab,
    getTab,
    updateTabQuery,
    setTabExecuting,
    setTabResults,
    setTabError,
    setTabBackend,
    markTabSaved,
    openFileInNewTab,
    restoreFromLocalStorage,
    clearAllTabs,
  }
})
