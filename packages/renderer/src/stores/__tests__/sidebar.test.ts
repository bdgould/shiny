import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSidebarStore } from '../sidebar'

const WIDTH_KEY = 'shiny:sidebar:drawerWidth'
const PANEL_KEY = 'shiny:sidebar:activePanel'

function installLocalStorage() {
  const data = new Map<string, string>()
  const mock = {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, String(v))
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k)
    }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn(),
    length: 0,
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

describe('useSidebarStore', () => {
  beforeEach(() => {
    installLocalStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('defaults to closed drawer and default width', () => {
      const store = useSidebarStore()
      expect(store.activePanel).toBeNull()
      expect(store.isDrawerOpen).toBe(false)
      expect(store.drawerWidth).toBe(320)
    })

    it('restores a valid saved panel and width', () => {
      localStorage.setItem(PANEL_KEY, 'history')
      localStorage.setItem(WIDTH_KEY, '450')
      const store = useSidebarStore()
      expect(store.activePanel).toBe('history')
      expect(store.isDrawerOpen).toBe(true)
      expect(store.drawerWidth).toBe(450)
    })

    it('ignores an unknown saved panel', () => {
      localStorage.setItem(PANEL_KEY, 'bogus')
      expect(useSidebarStore().activePanel).toBeNull()
    })

    it('clamps saved widths into bounds', () => {
      localStorage.setItem(WIDTH_KEY, '5000')
      expect(useSidebarStore().drawerWidth).toBe(600)

      setActivePinia(createPinia())
      localStorage.setItem(WIDTH_KEY, '10')
      expect(useSidebarStore().drawerWidth).toBe(200)
    })

    it('falls back to default width for non-numeric saved value', () => {
      localStorage.setItem(WIDTH_KEY, 'wide')
      expect(useSidebarStore().drawerWidth).toBe(320)
    })

    it('falls back to defaults when localStorage throws', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('denied')
      })
      const store = useSidebarStore()
      expect(store.activePanel).toBeNull()
      expect(store.drawerWidth).toBe(320)
      expect(warn).toHaveBeenCalledTimes(2)
    })
  })

  describe('togglePanel', () => {
    it('opens a panel and persists it', () => {
      const store = useSidebarStore()
      store.togglePanel('ai')
      expect(store.activePanel).toBe('ai')
      expect(localStorage.getItem(PANEL_KEY)).toBe('ai')
    })

    it('switches to a different panel', () => {
      const store = useSidebarStore()
      store.togglePanel('ai')
      store.togglePanel('settings')
      expect(store.activePanel).toBe('settings')
    })

    it('closes when the same panel is toggled and removes persisted value', () => {
      const store = useSidebarStore()
      store.togglePanel('connection')
      store.togglePanel('connection')
      expect(store.activePanel).toBeNull()
      expect(store.isDrawerOpen).toBe(false)
      expect(localStorage.getItem(PANEL_KEY)).toBeNull()
    })
  })

  describe('setActivePanel / closeDrawer', () => {
    it('sets panel directly and closes', () => {
      const store = useSidebarStore()
      store.setActivePanel('history')
      expect(store.activePanel).toBe('history')
      expect(localStorage.getItem(PANEL_KEY)).toBe('history')

      store.closeDrawer()
      expect(store.activePanel).toBeNull()
      expect(localStorage.getItem(PANEL_KEY)).toBeNull()
    })

    it('setting the same panel twice keeps it open', () => {
      const store = useSidebarStore()
      store.setActivePanel('ai')
      store.setActivePanel('ai')
      expect(store.activePanel).toBe('ai')
    })
  })

  describe('setDrawerWidth', () => {
    it('stores and persists a width within bounds', () => {
      const store = useSidebarStore()
      store.setDrawerWidth(400)
      expect(store.drawerWidth).toBe(400)
      expect(localStorage.getItem(WIDTH_KEY)).toBe('400')
    })

    it('clamps below min and above max', () => {
      const store = useSidebarStore()
      store.setDrawerWidth(50)
      expect(store.drawerWidth).toBe(200)
      store.setDrawerWidth(9999)
      expect(store.drawerWidth).toBe(600)
      expect(localStorage.getItem(WIDTH_KEY)).toBe('600')
    })

    it('still updates state when persisting fails', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useSidebarStore()
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('quota')
      })
      vi.mocked(localStorage.removeItem).mockImplementation(() => {
        throw new Error('quota')
      })
      store.setDrawerWidth(300)
      store.setActivePanel('ai')
      store.closeDrawer()
      expect(store.drawerWidth).toBe(300)
      expect(store.activePanel).toBeNull()
      expect(warn).toHaveBeenCalledTimes(3)
    })
  })
})
