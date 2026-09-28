import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BackendList from '../sidebar/panels/BackendList.vue'
import BackendListItem from '../sidebar/panels/BackendListItem.vue'
import SettingsPanel from '../sidebar/panels/SettingsPanel.vue'
import { useConnectionStore } from '@/stores/connection'
import { useTabsStore } from '@/stores/tabs'
import type { BackendConfig } from '@/types/backends'

function backend(id: string, overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    id,
    name: `Backend ${id}`,
    type: 'sparql-1.1',
    endpoint: `https://${id}.example/sparql`,
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

let wrapper: VueWrapper
let api: Record<string, ReturnType<typeof vi.fn>>
let confirmMock: ReturnType<typeof vi.fn>
let alertMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setActivePinia(createPinia())
  api = {
    testConnection: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    getSelected: vi.fn().mockResolvedValue(null),
  }
  Object.assign(window.electronAPI.backends, api)
  confirmMock = vi.fn(() => true)
  alertMock = vi.fn()
  vi.stubGlobal('confirm', confirmMock)
  vi.stubGlobal('alert', alertMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function mountList(backends: BackendConfig[]) {
  useConnectionStore().backends = backends
  wrapper = mount(BackendList, { global: { stubs: { Transition: true } } })
  return wrapper
}

describe('BackendList', () => {
  it('emits add from the header button', async () => {
    const w = mountList([])
    await w.find('.list-header button').trigger('click')
    expect(w.emitted('add')).toHaveLength(1)
  })

  it('shows empty, loading and error states', async () => {
    const w = mountList([])
    expect(w.find('.empty-state').text()).toContain('No backends configured')
    const store = useConnectionStore()
    store.isLoading = true
    await w.vm.$nextTick()
    expect(w.find('.loading-state').exists()).toBe(true)
    store.isLoading = false
    store.error = 'IPC failed'
    await w.vm.$nextTick()
    expect(w.find('.error-state').text()).toContain('IPC failed')
    await w.find('.error-state button').trigger('click')
    await flushPromises()
    expect(api.getAll).toHaveBeenCalled()
  })

  it('renders an item per backend with type and auth labels', () => {
    const w = mountList([
      backend('a'),
      backend('b', { type: 'graphdb', authType: 'basic' }),
      backend('c', { type: 'mystery' as never, authType: 'weird' as never }),
    ])
    const items = w.findAllComponents(BackendListItem)
    expect(items).toHaveLength(3)
    expect(items[0].find('.backend-name').text()).toBe('Backend a')
    expect(items[0].find('.backend-type').text()).toBe('Generic SPARQL 1.1')
    expect(items[0].text()).toContain('https://a.example/sparql')
    expect(items[0].text()).toContain('No Authentication')
    expect(items[1].find('.backend-type').text()).toBe('GraphDB')
    expect(items[1].text()).toContain('Basic Auth (Username/Password)')
    expect(items[2].find('.backend-type').text()).toBe('mystery')
    expect(items[2].text()).toContain('weird')
  })

  it('emits edit with the backend', async () => {
    const b = backend('a')
    const w = mountList([b])
    await w.find('button[title="Edit"]').trigger('click')
    expect(w.emitted('edit')).toEqual([[b]])
  })

  it('tests a connection, shows the spinner, then the result which clears after 5s', async () => {
    let resolve!: (v: { valid: boolean; error?: string }) => void
    api.testConnection.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = mountList([backend('a')])
    await w.find('button[title="Test connection"]').trigger('click')
    expect(w.find('.spinner').exists()).toBe(true)
    expect(w.find('button[title="Test connection"]').attributes('disabled')).toBeDefined()
    expect(w.find('.test-result').classes()).toContain('testing')

    resolve({ valid: true })
    await flushPromises()
    expect(w.find('.spinner').exists()).toBe(false)
    expect(w.find('.test-result').text()).toBe('✓ Connection successful')
    expect(w.find('.test-result').classes()).toContain('success')

    vi.advanceTimersByTime(5000)
    await flushPromises()
    expect(w.find('.test-result').exists()).toBe(false)
  })

  it('shows failed and thrown connection tests', async () => {
    const w = mountList([backend('a')])
    api.testConnection.mockResolvedValueOnce({ valid: false, error: '401' })
    await w.find('button[title="Test connection"]').trigger('click')
    await flushPromises()
    expect(w.find('.test-result').text()).toBe('✗ 401')
    expect(w.find('.test-result').classes()).toContain('error')

    api.testConnection.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await w.find('button[title="Test connection"]').trigger('click')
    await flushPromises()
    expect(w.find('.test-result').text()).toBe('✗ ECONNREFUSED')
  })

  it('deletes a backend only after confirmation', async () => {
    const w = mountList([backend('a'), backend('b')])
    confirmMock.mockReturnValueOnce(false)
    await w.find('button[title="Delete"]').trigger('click')
    expect(api.delete).not.toHaveBeenCalled()

    await w.find('button[title="Delete"]').trigger('click')
    await flushPromises()
    expect(api.delete).toHaveBeenCalledWith('a')
    expect(w.findAllComponents(BackendListItem)).toHaveLength(1)
  })

  it('alerts when delete fails', async () => {
    api.delete.mockRejectedValue(new Error('in use'))
    const w = mountList([backend('a')])
    await w.find('button[title="Delete"]').trigger('click')
    await flushPromises()
    expect(alertMock).toHaveBeenCalledWith('in use')
  })
})

describe('SettingsPanel', () => {
  it.each([
    ['Query Connection', 'query'],
    ['Prefix Management', 'prefix'],
    ['SPARQL Formatting', 'sparql-formatting'],
    ['Ontology Cache', 'cache'],
    ['AI Configuration', 'ai'],
  ] as const)('%s opens a %s settings tab once and refocuses it', async (title, type) => {
    wrapper = mount(SettingsPanel)
    const tabs = useTabsStore()
    const item = wrapper
      .findAll('.settings-item')
      .find((i) => i.find('.settings-item-title').text() === title)!
    await item.trigger('click')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.activeTab?.settingsType).toBe(type)
    expect(tabs.activeTab?.isSettings).toBe(true)

    tabs.createTab()
    await item.trigger('click')
    expect(tabs.tabs).toHaveLength(2)
    expect(tabs.activeTab?.settingsType).toBe(type)
  })
})
