import { useTabsStore } from '../stores/tabs'
import { useToast } from './useToast'
import type { QueryType } from '../services/sparql/queryDetector'
import { serializeResults, getAvailableFormats } from '../utils/serializeResults'

/**
 * Last path component of a file path, on either separator.
 */
export function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

export function useResultsSave() {
  const tabsStore = useTabsStore()
  const toast = useToast()

  /**
   * Check if save results is available for the active tab
   */
  function canSaveResults(): boolean {
    const activeTab = tabsStore.activeTab
    return !!(activeTab && activeTab.results && activeTab.queryType)
  }

  /**
   * Get available export formats for the active tab's query type
   */
  function getExportFormats(): Array<{ value: string; label: string }> {
    const activeTab = tabsStore.activeTab
    if (!activeTab || !activeTab.queryType) {
      return []
    }
    return getAvailableFormats(activeTab.queryType)
  }

  /**
   * Save query results to a file
   *
   * @param format - The desired export format (csv, json, turtle, etc.)
   * @returns Promise<boolean> - true if save was successful
   */
  async function saveResults(format: string): Promise<boolean> {
    try {
      const activeTab = tabsStore.activeTab
      if (!activeTab) {
        toast.warning('No active tab')
        return false
      }

      if (!activeTab.results || !activeTab.queryType) {
        toast.warning('No results to save. Execute a query first.')
        return false
      }

      // Serialize results based on query type and format
      const serialized = await serializeResults(
        activeTab.results,
        activeTab.queryType as QueryType,
        format
      )

      // Call Electron API to save file
      const result = await window.electronAPI.files.saveResults(
        serialized,
        activeTab.queryType,
        format,
        activeTab.name
      )

      if (result.success && result.filePath) {
        const savedPath = result.filePath
        toast.success(`Saved results to ${fileBaseName(savedPath)}`, 6000, {
          label: 'Reveal',
          onClick: () => void window.electronAPI.files.showInFolder(savedPath),
        })
        return true
      } else if (result.canceled) {
        // The user dismissed the save dialog; nothing to report
        return false
      } else {
        toast.error(`Failed to save results: ${result.error || 'Unknown error'}`)
        return false
      }
    } catch (error) {
      console.error('Error saving results:', error)
      toast.error(
        `Error saving results: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return false
    }
  }

  return {
    canSaveResults,
    getExportFormats,
    saveResults,
  }
}
