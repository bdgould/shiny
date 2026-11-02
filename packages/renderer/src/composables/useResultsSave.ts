import { useTabsStore } from '../stores/tabs'
import { useToast } from './useToast'
import type { QueryType } from '../services/sparql/queryDetector'
import { serializeResults, getAvailableFormats, FORMAT_LABELS } from '../utils/serializeResults'

/**
 * Last path component of a file path, on either separator.
 */
export function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

/** What a save needs to know about the results being exported. */
export interface ResultsSource {
  name: string
  results: any | null
  queryType: QueryType | null
}

/** Default source: the active tab in the main window. */
function activeTabSource(): ResultsSource | null {
  const activeTab = useTabsStore().activeTab
  if (!activeTab) return null
  return { name: activeTab.name, results: activeTab.results, queryType: activeTab.queryType }
}

/**
 * @param getSource - where the results come from; defaults to the active tab.
 *   The popped-out results window passes its mirrored snapshot instead.
 */
export function useResultsSave(getSource: () => ResultsSource | null = activeTabSource) {
  const toast = useToast()

  /**
   * Check if save results is available for the active tab
   */
  function canSaveResults(): boolean {
    const source = getSource()
    return !!(source && source.results && source.queryType)
  }

  /**
   * Get available export formats for the active tab's query type
   */
  function getExportFormats(): Array<{ value: string; label: string }> {
    const source = getSource()
    if (!source || !source.queryType) {
      return []
    }
    return getAvailableFormats(source.queryType)
  }

  /**
   * Save query results to a file
   *
   * @param format - The desired export format (csv, json, turtle, etc.)
   * @returns Promise<boolean> - true if save was successful
   */
  async function saveResults(format: string): Promise<boolean> {
    try {
      const source = getSource()
      if (!source) {
        toast.warning('No active tab')
        return false
      }

      if (!source.results || !source.queryType) {
        toast.warning('No results to save. Execute a query first.')
        return false
      }

      // Serialize results based on query type and format
      const serialized = await serializeResults(source.results, source.queryType, format)

      // Call Electron API to save file
      const result = await window.electronAPI.files.saveResults(
        serialized,
        source.queryType,
        format,
        source.name
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

  /**
   * Copy serialized results to the clipboard
   *
   * @param format - The desired export format (csv, json, turtle, etc.)
   * @returns Promise<boolean> - true if the clipboard write succeeded
   */
  async function copyResults(format: string): Promise<boolean> {
    try {
      const source = getSource()
      if (!source || !source.results || !source.queryType) {
        toast.warning('No results to copy. Execute a query first.')
        return false
      }

      const serialized = await serializeResults(source.results, source.queryType, format)
      await navigator.clipboard.writeText(serialized)
      toast.success(`Copied results as ${FORMAT_LABELS[format] ?? format}`)
      return true
    } catch (error) {
      console.error('Error copying results:', error)
      toast.error(
        `Error copying results: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return false
    }
  }

  return {
    canSaveResults,
    getExportFormats,
    saveResults,
    copyResults,
  }
}
