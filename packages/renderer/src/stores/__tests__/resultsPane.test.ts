import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResultsPaneStore } from '../resultsPane'

const COLLAPSED_KEY = 'shiny:results:collapsed'
const HEIGHT_KEY = 'shiny:results:height'

describe('useResultsPaneStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to expanded, 300px and not popped out', () => {
    const store = useResultsPaneStore()
    expect(store.isCollapsed).toBe(false)
    expect(store.heightPx).toBe(300)
    expect(store.isPoppedOut).toBe(false)
  })

  it('restores saved collapsed state and height', () => {
    localStorage.setItem(COLLAPSED_KEY, 'true')
    localStorage.setItem(HEIGHT_KEY, '420')
    const store = useResultsPaneStore()
    expect(store.isCollapsed).toBe(true)
    expect(store.heightPx).toBe(420)
  })

  it('ignores an unparsable height and enforces the minimum on load', () => {
    localStorage.setItem(HEIGHT_KEY, 'tall')
    expect(useResultsPaneStore().heightPx).toBe(300)
    setActivePinia(createPinia())
    localStorage.setItem(HEIGHT_KEY, '12')
    expect(useResultsPaneStore().heightPx).toBe(100)
  })

  it('toggles and persists collapsed state', () => {
    const store = useResultsPaneStore()
    store.toggleCollapsed()
    expect(store.isCollapsed).toBe(true)
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('true')
    store.setCollapsed(false)
    expect(store.isCollapsed).toBe(false)
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('false')
  })

  it('clamps and persists height', () => {
    const store = useResultsPaneStore()
    store.setHeight(250.6)
    expect(store.heightPx).toBe(251)
    expect(localStorage.getItem(HEIGHT_KEY)).toBe('251')
    store.setHeight(10)
    expect(store.heightPx).toBe(100)
  })

  it('tracks popped-out state in memory only', () => {
    const store = useResultsPaneStore()
    store.setPoppedOut(true)
    expect(store.isPoppedOut).toBe(true)
    expect(localStorage.length).toBe(0)
  })

  it('survives localStorage failures', () => {
    const throwing = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      clear: vi.fn(),
      removeItem: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: throwing, configurable: true })
    try {
      const store = useResultsPaneStore()
      expect(store.isCollapsed).toBe(false)
      expect(store.heightPx).toBe(300)
      store.setCollapsed(true)
      store.setHeight(200)
      expect(store.isCollapsed).toBe(true)
      expect(store.heightPx).toBe(200)
      expect(console.warn).toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true })
    }
  })
})
