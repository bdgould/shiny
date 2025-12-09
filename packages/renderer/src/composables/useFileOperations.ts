import { useTabsStore } from '../stores/tabs'
import { useConnectionStore } from '../stores/connection'
import type { BackendMetadata, QueryFileData } from '../types/electron'

export function useFileOperations() {
  const tabsStore = useTabsStore()
  const connectionStore = useConnectionStore()

  /**
   * Save the active tab's query to a .rq file
   */
  async function saveQuery(): Promise<boolean> {
    try {
      const activeTab = tabsStore.activeTab
      if (!activeTab) {
        alert('No active tab to save')
        return false
      }

      if (!activeTab.query || activeTab.query.trim() === '') {
        alert('No query to save')
        return false
      }

      // Get backend metadata if a backend is selected for this tab
      let backendMetadata: BackendMetadata | null = null
      if (activeTab.backendId) {
        const backend = connectionStore.backends.find((b) => b.id === activeTab.backendId)
        if (backend) {
          backendMetadata = {
            id: backend.id,
            name: backend.name,
          }
        }
      }

      const result = await window.electronAPI.files.saveQuery(
        activeTab.query,
        backendMetadata,
        activeTab.filePath || undefined
      )

      if (result.success && result.filePath) {
        // Extract filename from file path
        const fileName = result.filePath.split('/').pop()?.replace(/\.rq$/, '') || 'Untitled'

        // Update tab with saved state
        tabsStore.markTabSaved(activeTab.id, result.filePath, fileName)

        // eslint-disable-next-line no-console
        console.log('Query saved successfully:', result.filePath)
        return true
      } else {
        alert(`Failed to save query: ${result.error || 'Unknown error'}`)
        return false
      }
    } catch (error) {
      console.error('Error saving query:', error)
      alert(`Error saving query: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Open a .rq file and load it into a new tab
   */
  async function openQuery(): Promise<boolean> {
    try {
      const result = await window.electronAPI.files.openQuery()

      // Check if result is an error
      if ('error' in result) {
        if (result.error !== 'No file selected') {
          alert(`Failed to open query: ${result.error}`)
        }
        return false
      }

      // Load the query content into a new tab
      const fileData = result as QueryFileData

      // Extract filename from file path
      const fileName = fileData.filePath.split('/').pop()?.replace(/\.rq$/, '') || 'Untitled'

      // Find backend by ID or name
      let backendId: string | null = null
      if (fileData.metadata) {
        const backend = findBackendFromMetadata(fileData.metadata)

        if (backend) {
          backendId = backend.id
        } else {
          showBackendNotFoundNotification(fileData.metadata.name)
        }
      }

      // Create new tab with file content
      tabsStore.openFileInNewTab({
        content: fileData.content,
        filePath: fileData.filePath,
        fileName,
        backendId,
      })

      // eslint-disable-next-line no-console
      console.log('Query loaded successfully:', fileData.filePath)
      return true
    } catch (error) {
      console.error('Error opening query:', error)
      alert(`Error opening query: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Find a backend that matches the metadata
   * Tries to match by ID first, then by name
   */
  function findBackendFromMetadata(metadata: BackendMetadata) {
    // Try to find by ID first (exact match)
    let backend = connectionStore.backends.find((b) => b.id === metadata.id)

    // If not found by ID, try to find by name
    if (!backend) {
      backend = connectionStore.backends.find((b) => b.name === metadata.name)
    }

    return backend || null
  }

  /**
   * Show a notification that the backend was not found
   */
  function showBackendNotFoundNotification(backendName: string) {
    // Simple alert for now - could be replaced with a toast notification
    alert(`Backend "${backendName}" not found in configuration. Please select a backend manually.`)
  }

  return {
    saveQuery,
    openQuery,
  }
}
