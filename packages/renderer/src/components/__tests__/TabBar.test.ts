import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TabBar from '../tabs/TabBar.vue'
import { useTabsStore } from '@/stores/tabs'

describe('TabBar', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mountBar() {
    wrapper = mount(TabBar)
    return wrapper
  }

  it('renders one button per tab and marks the active tab', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'First' })
    const second = store.createTab({ name: 'Second' })
    const w = mountBar()

    const tabs = w.findAll('.tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toContain('First')
    expect(tabs[1].classes()).toContain('active')
    expect(store.activeTabId).toBe(second)
  })

  it('switches the active tab on click', async () => {
    const store = useTabsStore()
    const first = store.createTab({ name: 'First' })
    store.createTab({ name: 'Second' })
    const w = mountBar()

    await w.findAll('.tab')[0].trigger('click')
    expect(store.activeTabId).toBe(first)
    expect(w.findAll('.tab')[0].classes()).toContain('active')
  })

  it('creates a new tab when + is clicked', async () => {
    const store = useTabsStore()
    store.createTab()
    const w = mountBar()

    await w.find('.tab-new').trigger('click')
    expect(store.tabs).toHaveLength(2)
    expect(w.findAll('.tab')).toHaveLength(2)
    expect(w.findAll('.tab')[1].text()).toContain('Untitled-2')
  })

  it('shows dirty, executing and settings indicators', async () => {
    const store = useTabsStore()
    const id = store.createTab({ name: 'Q' })
    store.createTab({ isSettings: true, settingsType: 'ai' })
    const w = mountBar()
    expect(w.find('.dirty-indicator').exists()).toBe(false)
    expect(w.find('.executing-indicator').exists()).toBe(false)

    store.updateTabQuery(id, 'SELECT * WHERE {}')
    store.setTabExecuting(id, true)
    await w.vm.$nextTick()

    const first = w.findAll('.tab')[0]
    expect(first.find('.dirty-indicator').exists()).toBe(true)
    expect(first.find('.executing-indicator').exists()).toBe(true)
    const settings = w.findAll('.tab')[1]
    expect(settings.find('.settings-icon').exists()).toBe(true)
    expect(settings.text()).toContain('AI Settings')
  })

  it('uses the file path as tooltip when present, otherwise the name', () => {
    const store = useTabsStore()
    store.openFileInNewTab({
      content: 'ASK {}',
      filePath: '/tmp/q.rq',
      fileName: 'q.rq',
      backendId: null,
    })
    store.createTab({ name: 'Plain' })
    const w = mountBar()
    const tabs = w.findAll('.tab')
    expect(tabs[0].attributes('title')).toBe('/tmp/q.rq')
    expect(tabs[1].attributes('title')).toBe('Plain')
  })

  it('closes a clean tab without confirmation', async () => {
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const store = useTabsStore()
    store.createTab({ name: 'A' })
    store.createTab({ name: 'B' })
    const w = mountBar()

    await w.findAll('.tab-close')[0].trigger('click')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(store.tabs.map((t) => t.name)).toEqual(['B'])
  })

  it('does not switch tabs when clicking close (click.stop)', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'A' })
    const b = store.createTab({ name: 'B' })
    store.createTab({ name: 'C' })
    store.setActiveTab(b)
    const w = mountBar()

    await w.findAll('.tab-close')[2].trigger('click')
    expect(store.activeTabId).toBe(b)
  })

  it('asks for confirmation before closing a dirty tab and respects cancel', async () => {
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const store = useTabsStore()
    const id = store.createTab({ name: 'Dirty' })
    store.createTab({ name: 'Other' })
    store.updateTabQuery(id, 'SELECT 1')
    const w = mountBar()

    await w.findAll('.tab-close')[0].trigger('click')
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('"Dirty" has unsaved changes'))
    expect(store.tabs).toHaveLength(2)

    confirmSpy.mockReturnValue(true)
    await w.findAll('.tab-close')[0].trigger('click')
    expect(store.tabs.map((t) => t.name)).toEqual(['Other'])
  })

  it('closes a tab via keyboard (Enter / Space) on the close control', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'A' })
    store.createTab({ name: 'B' })
    store.createTab({ name: 'C' })
    const w = mountBar()

    await w.findAll('.tab-close')[0].trigger('keydown', { key: 'Enter' })
    expect(store.tabs.map((t) => t.name)).toEqual(['B', 'C'])
    await w.findAll('.tab-close')[0].trigger('keydown', { key: ' ' })
    expect(store.tabs.map((t) => t.name)).toEqual(['C'])
  })

  it('closes a tab on middle click', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'A' })
    store.createTab({ name: 'B' })
    const w = mountBar()

    await w.findAll('.tab')[0].trigger('mousedown', { button: 1 })
    expect(store.tabs.map((t) => t.name)).toEqual(['B'])
  })

  it('closes the active tab with Ctrl/Cmd+W', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'A' })
    store.createTab({ name: 'B' })
    mountBar()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, metaKey: true }))
    expect(store.tabs.map((t) => t.name)).toEqual(['A'])
  })

  it('creates a fresh tab when the last tab is closed', async () => {
    const store = useTabsStore()
    store.createTab({ name: 'Only' })
    const w = mountBar()

    await w.find('.tab-close').trigger('click')
    expect(store.tabs).toHaveLength(1)
    expect(store.tabs[0].name).toMatch(/^Untitled-/)
  })
})
