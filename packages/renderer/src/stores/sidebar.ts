/**
 * Sidebar state management
 * Handles drawer visibility, active panel, and drawer width
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type SidebarPanel = 'connection' | 'ai' | 'history' | null

const STORAGE_KEY_DRAWER_WIDTH = 'shiny:sidebar:drawerWidth'
const STORAGE_KEY_ACTIVE_PANEL = 'shiny:sidebar:activePanel'

const DEFAULT_DRAWER_WIDTH = 320
const MIN_DRAWER_WIDTH = 200
const MAX_DRAWER_WIDTH = 600

export const useSidebarStore = defineStore('sidebar', () => {
  // State
  const activePanel = ref<SidebarPanel>(loadActivePanel())
  const drawerWidth = ref(loadDrawerWidth())

  // Computed
  const isDrawerOpen = computed(() => activePanel.value !== null)

  // Actions
  function togglePanel(panel: SidebarPanel) {
    if (activePanel.value === panel) {
      // Clicking the same panel closes the drawer
      activePanel.value = null
    } else {
      // Clicking a different panel opens/switches to it
      activePanel.value = panel
    }
    saveActivePanel(activePanel.value)
  }

  function setActivePanel(panel: SidebarPanel) {
    activePanel.value = panel
    saveActivePanel(panel)
  }

  function closeDrawer() {
    activePanel.value = null
    saveActivePanel(null)
  }

  function setDrawerWidth(width: number) {
    // Clamp width to min/max bounds
    const clampedWidth = Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, width))
    drawerWidth.value = clampedWidth
    saveDrawerWidth(clampedWidth)
  }

  // Persistence helpers
  function loadDrawerWidth(): number {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAWER_WIDTH)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed)) {
          return Math.max(MIN_DRAWER_WIDTH, Math.min(MAX_DRAWER_WIDTH, parsed))
        }
      }
    } catch (error) {
      console.warn('Failed to load drawer width from localStorage:', error)
    }
    return DEFAULT_DRAWER_WIDTH
  }

  function saveDrawerWidth(width: number): void {
    try {
      localStorage.setItem(STORAGE_KEY_DRAWER_WIDTH, width.toString())
    } catch (error) {
      console.warn('Failed to save drawer width to localStorage:', error)
    }
  }

  function loadActivePanel(): SidebarPanel {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_PANEL)
      if (saved === 'connection' || saved === 'ai' || saved === 'history') {
        return saved
      }
    } catch (error) {
      console.warn('Failed to load active panel from localStorage:', error)
    }
    // Default to closed
    return null
  }

  function saveActivePanel(panel: SidebarPanel): void {
    try {
      if (panel === null) {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_PANEL)
      } else {
        localStorage.setItem(STORAGE_KEY_ACTIVE_PANEL, panel)
      }
    } catch (error) {
      console.warn('Failed to save active panel to localStorage:', error)
    }
  }

  return {
    // State
    activePanel,
    drawerWidth,

    // Computed
    isDrawerOpen,

    // Actions
    togglePanel,
    setActivePanel,
    closeDrawer,
    setDrawerWidth,
  }
})
