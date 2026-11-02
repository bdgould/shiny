/**
 * Results pane layout state: collapsed, height, and whether the pane has been
 * popped out into its own window. Collapsed and height persist across
 * sessions; popped-out does not, since results themselves are not persisted.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY_COLLAPSED = 'shiny:results:collapsed'
const STORAGE_KEY_HEIGHT = 'shiny:results:height'

export const DEFAULT_RESULTS_HEIGHT = 300
export const MIN_RESULTS_HEIGHT = 100

export const useResultsPaneStore = defineStore('resultsPane', () => {
  const isCollapsed = ref(loadCollapsed())
  const heightPx = ref(loadHeight())
  const isPoppedOut = ref(false)

  function setCollapsed(collapsed: boolean) {
    isCollapsed.value = collapsed
    saveCollapsed(collapsed)
  }

  function toggleCollapsed() {
    setCollapsed(!isCollapsed.value)
  }

  function setHeight(height: number) {
    const clamped = Math.max(MIN_RESULTS_HEIGHT, Math.round(height))
    heightPx.value = clamped
    saveHeight(clamped)
  }

  function setPoppedOut(poppedOut: boolean) {
    isPoppedOut.value = poppedOut
  }

  function loadCollapsed(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY_COLLAPSED) === 'true'
    } catch (error) {
      console.warn('Failed to load results pane state from localStorage:', error)
      return false
    }
  }

  function saveCollapsed(collapsed: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(collapsed))
    } catch (error) {
      console.warn('Failed to save results pane state to localStorage:', error)
    }
  }

  function loadHeight(): number {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HEIGHT)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed)) {
          return Math.max(MIN_RESULTS_HEIGHT, parsed)
        }
      }
    } catch (error) {
      console.warn('Failed to load results pane height from localStorage:', error)
    }
    return DEFAULT_RESULTS_HEIGHT
  }

  function saveHeight(height: number): void {
    try {
      localStorage.setItem(STORAGE_KEY_HEIGHT, height.toString())
    } catch (error) {
      console.warn('Failed to save results pane height to localStorage:', error)
    }
  }

  return {
    isCollapsed,
    heightPx,
    isPoppedOut,
    setCollapsed,
    toggleCollapsed,
    setHeight,
    setPoppedOut,
  }
})
