import { useTabsStore } from '../stores/tabs';
import type { QueryType } from '../services/sparql/queryDetector';
import { serializeResults, getAvailableFormats } from '../utils/serializeResults';

export function useResultsSave() {
  const tabsStore = useTabsStore();

  /**
   * Check if save results is available for the active tab
   */
  function canSaveResults(): boolean {
    const activeTab = tabsStore.activeTab;
    return !!(activeTab && activeTab.results && activeTab.queryType);
  }

  /**
   * Get available export formats for the active tab's query type
   */
  function getExportFormats(): Array<{value: string, label: string}> {
    const activeTab = tabsStore.activeTab;
    if (!activeTab || !activeTab.queryType) {
      return [];
    }
    return getAvailableFormats(activeTab.queryType);
  }

  /**
   * Save query results to a file
   *
   * @param format - The desired export format (csv, json, turtle, etc.)
   * @returns Promise<boolean> - true if save was successful
   */
  async function saveResults(format: string): Promise<boolean> {
    try {
      const activeTab = tabsStore.activeTab;
      if (!activeTab) {
        alert('No active tab');
        return false;
      }

      if (!activeTab.results || !activeTab.queryType) {
        alert('No results to save');
        return false;
      }

      // Serialize results based on query type and format
      const serialized = await serializeResults(
        activeTab.results,
        activeTab.queryType as QueryType,
        format
      );

      // Call Electron API to save file
      const result = await window.electronAPI.files.saveResults(
        serialized,
        activeTab.queryType,
        format
      );

      if (result.success) {
        console.log('Results saved successfully:', result.filePath);
        return true;
      } else {
        alert(`Failed to save results: ${result.error || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Error saving results:', error);
      alert(`Error saving results: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  return {
    canSaveResults,
    getExportFormats,
    saveResults,
  };
}
