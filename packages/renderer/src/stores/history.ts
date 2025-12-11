import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QueryType } from '@/services/sparql/queryDetector'
import { v4 as uuidv4 } from 'uuid'

export interface QueryHistoryEntry {
  id: string
  query: string
  backendId: string | null
  backendName: string
  executedAt: number
  duration: number | null // Execution time in milliseconds
  resultCount: number | null // Number of results (for SELECT queries)
  queryType: QueryType | null
  success: boolean
  error: string | null
}

const STORAGE_KEY = 'shiny-query-history'
const MAX_HISTORY_SIZE = 100

export const useHistoryStore = defineStore('history', () => {
  const entries = ref<QueryHistoryEntry[]>([])

  // Computed: sorted entries (most recent first)
  const sortedEntries = computed(() => {
    return [...entries.value].sort((a, b) => b.executedAt - a.executedAt)
  })

  // Add a new history entry
  function addEntry(entry: Omit<QueryHistoryEntry, 'id'>) {
    const newEntry: QueryHistoryEntry = {
      id: uuidv4(),
      ...entry,
    }

    // Add to the beginning of the array
    entries.value.unshift(newEntry)

    // Keep only the last MAX_HISTORY_SIZE entries
    if (entries.value.length > MAX_HISTORY_SIZE) {
      entries.value = entries.value.slice(0, MAX_HISTORY_SIZE)
    }

    // Persist to localStorage
    persistToLocalStorage()
  }

  // Clear all history
  function clearHistory() {
    entries.value = []
    persistToLocalStorage()
  }

  // Delete a specific entry
  function deleteEntry(id: string) {
    const index = entries.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      entries.value.splice(index, 1)
      persistToLocalStorage()
    }
  }

  // Get entry by ID
  function getEntry(id: string): QueryHistoryEntry | null {
    return entries.value.find((e) => e.id === id) || null
  }

  // Persist to localStorage
  function persistToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    } catch (error) {
      console.error('Failed to persist history to localStorage:', error)
    }
  }

  // Restore from localStorage
  function restoreFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        entries.value = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to restore history from localStorage:', error)
      entries.value = []
    }
  }

  return {
    // State
    entries,
    sortedEntries,

    // Actions
    addEntry,
    clearHistory,
    deleteEntry,
    getEntry,
    restoreFromLocalStorage,
  }
})
