/**
 * Connection/Backend management store
 * Handles CRUD operations for backend configurations
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BackendConfig, BackendCredentialsInput } from '../types/backends'

export const useConnectionStore = defineStore('connection', () => {
  // State
  const backends = ref<BackendConfig[]>([])
  const selectedBackendId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const selectedBackend = computed(() => {
    if (!selectedBackendId.value) return null
    return backends.value.find((b) => b.id === selectedBackendId.value) || null
  })

  const hasBackends = computed(() => backends.value.length > 0)

  // Actions
  async function loadBackends() {
    isLoading.value = true
    error.value = null

    try {
      const loadedBackends = await window.electronAPI.backends.getAll()
      backends.value = loadedBackends

      // Load selected backend ID
      const selected = await window.electronAPI.backends.getSelected()
      selectedBackendId.value = selected

      return backends.value
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load backends'
      error.value = message
      console.error('Failed to load backends:', err)
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  async function createBackend(
    config: {
      name: string
      type: string
      endpoint: string
      authType: string
    },
    credentials?: BackendCredentialsInput
  ) {
    isLoading.value = true
    error.value = null

    try {
      const created = await window.electronAPI.backends.create(config, credentials)
      backends.value.push(created)

      // If this is the first backend, select it automatically
      if (backends.value.length === 1) {
        await selectBackend(created.id)
      }

      return created
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create backend'
      error.value = message
      console.error('Failed to create backend:', err)
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  async function updateBackend(
    id: string,
    updates: Partial<BackendConfig>,
    credentials?: BackendCredentialsInput
  ) {
    isLoading.value = true
    error.value = null

    try {
      const updated = await window.electronAPI.backends.update(id, updates, credentials)

      // Update in local state
      const index = backends.value.findIndex((b) => b.id === id)
      if (index >= 0) {
        backends.value[index] = updated
      }

      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update backend'
      error.value = message
      console.error('Failed to update backend:', err)
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  async function deleteBackend(id: string) {
    isLoading.value = true
    error.value = null

    try {
      await window.electronAPI.backends.delete(id)

      // Remove from local state
      backends.value = backends.value.filter((b) => b.id !== id)

      // If this was the selected backend, clear selection
      if (selectedBackendId.value === id) {
        selectedBackendId.value = null
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete backend'
      error.value = message
      console.error('Failed to delete backend:', err)
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  async function selectBackend(id: string | null) {
    try {
      await window.electronAPI.backends.setSelected(id)
      selectedBackendId.value = id
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select backend'
      error.value = message
      console.error('Failed to select backend:', err)
      throw new Error(message)
    }
  }

  async function testConnection(id: string) {
    isLoading.value = true
    error.value = null

    try {
      const result = await window.electronAPI.backends.testConnection(id)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test connection'
      error.value = message
      console.error('Failed to test connection:', err)
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    backends,
    selectedBackendId,
    isLoading,
    error,

    // Computed
    selectedBackend,
    hasBackends,

    // Actions
    loadBackends,
    createBackend,
    updateBackend,
    deleteBackend,
    selectBackend,
    testConnection,
    clearError,
  }
})
