import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MainPane from '../layout/MainPane.vue'
import TabBar from '../tabs/TabBar.vue'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionStore } from '@/stores/connection'
import type { BackendConfig } from '@/types/backends'

vi.mock('@/components/editor/MonacoSparqlEditor.vue', () => ({
  default: { name: 'MonacoSparqlEditor', template: '<div class="monaco-stub" />' },
}))

const stubs = {
  QuerySettingsView: { template: '<div class="stub-query-settings" />' },
  PrefixManagementSettingsView: { template: '<div class="stub-prefix-settings" />' },
  SparqlFormattingSettingsView: { template: '<div class="stub-formatting-settings" />' },
  CacheSettingsView: { template: '<div class="stub-cache-settings" />' },
  AISettingsView: { template: '<div class="stub-ai-settings" />' },
  ResultsView: { template: '<div class="stub-results-view" />' },
}

const backends: BackendConfig[] = [
  {
    id: 'b1',
    name: 'DBpedia',
    type: 'sparql-1.1',
    endpoint: 'https://dbpedia.org/sparql',
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
  },
]

let wrapper: VueWrapper
let execute: ReturnType<typeof vi.fn>

function mountPane() {
  wrapper = mount(MainPane, { global: { stubs } })
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  execute = vi.fn()
  window.electronAPI.query.execute = execute as never
  useConnectionStore().backends = backends
})

afterEach(() => {
  wrapper?.unmount()
})

describe('MainPane', () => {
  it('renders the tab bar, editor and backend selector for a query tab', () => {
    useTabsStore().createTab()
    const w = mountPane()
    expect(w.findComponent(TabBar).exists()).toBe(true)
    expect(w.find('.monaco-stub').exists()).toBe(true)
    const options = w.findAll('.backend-select option')
    expect(options.map((o) => o.text())).toEqual(['Select backend...', 'DBpedia'])
    expect(w.find('.editor-controls .btn-primary').attributes('disabled')).toBeDefined()
    expect(w.find('.empty').text()).toContain('No results yet')
    expect(w.find('.shortcut-hint').text()).toMatch(/⌘↩|Ctrl\+↵/)
  })

  it('selecting a backend sets it on the active tab and enables Execute', async () => {
    const tabs = useTabsStore()
    tabs.createTab()
    const w = mountPane()
    await w.find('.backend-select').setValue('b1')
    expect(tabs.activeTab?.backendId).toBe('b1')
    expect(w.find('.editor-controls .btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('executes the query and renders results', async () => {
    const tabs = useTabsStore()
    tabs.createTab({ query: 'SELECT * WHERE { ?s ?p ?o }', backendId: 'b1' })
    execute.mockResolvedValue({
      queryType: 'SELECT',
      data: { head: { vars: [] }, results: { bindings: [] } },
    })
    const w = mountPane()
    await w.find('.editor-controls .btn-primary').trigger('click')
    await flushPromises()
    expect(execute).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }', 'b1')
    expect(w.find('.stub-results-view').exists()).toBe(true)
  })

  it('shows query errors and the executing state', async () => {
    const tabs = useTabsStore()
    const id = tabs.createTab({ query: 'SELECT', backendId: 'b1' })
    const w = mountPane()
    tabs.setTabExecuting(id, true)
    await w.vm.$nextTick()
    expect(w.find('.loading').text()).toBe('Executing query...')
    tabs.setTabExecuting(id, false)
    tabs.setTabError(id, 'Parse error at line 1')
    await w.vm.$nextTick()
    expect(w.find('.error').text()).toBe('Parse error at line 1')
  })

  it('executes with Ctrl/Cmd+Enter and re-expands collapsed results', async () => {
    const tabs = useTabsStore()
    tabs.createTab({ query: 'ASK {}', backendId: 'b1' })
    execute.mockResolvedValue({ queryType: 'ASK', data: { head: {}, boolean: true } })
    const w = mountPane()
    await w.find('button[title="Collapse results"]').trigger('click')
    expect(w.find('.results-section').exists()).toBe(false)
    expect(w.find('.results-collapsed').exists()).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true })
    )
    await flushPromises()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(w.find('.results-section').exists()).toBe(true)
  })

  it('collapses and expands the results panel', async () => {
    useTabsStore().createTab()
    const w = mountPane()
    await w.find('button[title="Collapse results"]').trigger('click')
    expect(w.find('.editor-section').attributes('style')).toContain('calc(100% - 32px)')
    await w.find('button[title="Expand results"]').trigger('click')
    expect(w.find('.results-section').exists()).toBe(true)
  })

  it('resizes the results panel by dragging, with a 100px minimum', async () => {
    useTabsStore().createTab()
    const w = mountPane()
    await w.find('.resizer').trigger('mousedown', { clientY: 500 })
    expect(w.find('.resizer').classes()).toContain('resizing')
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
    await w.vm.$nextTick()
    expect(w.find('.results-section').attributes('style')).toContain('height: 400px')
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 1000 }))
    await w.vm.$nextTick()
    expect(w.find('.results-section').attributes('style')).toContain('height: 100px')
    document.dispatchEvent(new MouseEvent('mouseup'))
    await w.vm.$nextTick()
    expect(w.find('.resizer').classes()).not.toContain('resizing')
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }))
    await w.vm.$nextTick()
    expect(w.find('.results-section').attributes('style')).toContain('height: 100px')
  })

  it.each([
    ['query', 'stub-query-settings'],
    ['prefix', 'stub-prefix-settings'],
    ['sparql-formatting', 'stub-formatting-settings'],
    ['cache', 'stub-cache-settings'],
    ['ai', 'stub-ai-settings'],
  ] as const)('renders the %s settings view for settings tabs', (settingsType, cls) => {
    useTabsStore().createTab({ isSettings: true, settingsType })
    const w = mountPane()
    expect(w.find(`.${cls}`).exists()).toBe(true)
    expect(w.find('.monaco-stub').exists()).toBe(false)
    expect(w.find('.results-section').exists()).toBe(false)
    expect(w.find('.editor-section').attributes('style')).toContain('height: 100%')
  })
})
