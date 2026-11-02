import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ResultsWindowApp from '@/ResultsWindowApp.vue'
import ResultsView from '@/components/results/ResultsView.vue'
import FormatSelectorDialog from '@/components/dialogs/FormatSelectorDialog.vue'
import { useResultsExport } from '@/composables/useResultsExport'
import type { ResultsWindowState } from '@/types/electron'

type Fn = ReturnType<typeof vi.fn>

const selectState: ResultsWindowState = {
  tabName: 'people',
  queryType: 'SELECT',
  results: {
    data: { head: { vars: ['s'] }, results: { bindings: [] } },
    queryType: 'SELECT',
  },
  error: null,
  isExecuting: false,
}

describe('ResultsWindowApp', () => {
  let rw: Record<string, Fn>
  let pushState: ((state: ResultsWindowState) => void) | null
  let saveResultsMenu: (() => void) | null
  let wrapper: VueWrapper

  function push(state: ResultsWindowState) {
    if (!pushState) throw new Error('onState was not subscribed')
    pushState(state)
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useResultsExport().closePicker()
    rw = window.electronAPI.resultsWindow as unknown as Record<string, Fn>
    for (const fn of Object.values(rw)) fn.mockReset()
    rw.ready.mockResolvedValue(true)
    rw.close.mockResolvedValue(undefined)
    rw.execute.mockResolvedValue(true)
    pushState = null
    rw.onState.mockImplementation((cb: (s: ResultsWindowState) => void) => {
      pushState = cb
      return vi.fn()
    })
    saveResultsMenu = null
    ;(window.electronAPI.menu.onSaveResults as Fn).mockImplementation((cb: () => void) => {
      saveResultsMenu = cb
      return vi.fn()
    })
    window.electronAPI.files.saveResults = vi
      .fn()
      .mockResolvedValue({ success: true, filePath: '/tmp/out.csv' }) as never
    wrapper = mount(ResultsWindowApp, {
      global: { stubs: { ToastContainer: true, FormatSelectorDialog: true } },
    })
  })

  afterEach(() => {
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('asks the main window for state on mount and shows the empty state', () => {
    expect(rw.ready).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.empty').text()).toContain('No results yet')
    expect(document.title).toBe('Results')
    expect(wrapper.find('button[title="Save results…"]').attributes('disabled')).toBeDefined()
  })

  it('renders snapshots as they arrive and titles the window after the tab', async () => {
    push({ ...selectState, isExecuting: true, results: null })
    await flushPromises()
    expect(wrapper.find('.loading').text()).toBe('Executing query...')
    expect(document.title).toBe('Results: people')

    push({ ...selectState, error: 'Parse error', results: null })
    await flushPromises()
    expect(wrapper.find('.error').text()).toBe('Parse error')

    push(selectState)
    await flushPromises()
    const view = wrapper.findComponent(ResultsView)
    expect(view.props('queryType')).toBe('SELECT')
    expect(view.props('results')).toEqual(selectState.results)
    expect(wrapper.find('.tab-name').text()).toBe('people')
    expect(wrapper.find('button[title="Save results…"]').attributes('disabled')).toBeUndefined()
  })

  it('pops back in by closing the window', async () => {
    await wrapper.find('.btn-pop-in').trigger('click')
    expect(rw.close).toHaveBeenCalledTimes(1)
  })

  it('relays Ctrl/Cmd+Enter to the main window', () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, metaKey: true })
    )
    expect(rw.execute).toHaveBeenCalledTimes(1)
  })

  it('saves the mirrored results from the toolbar and the menu', async () => {
    push(selectState)
    await flushPromises()
    await wrapper.find('button[title="Save results…"]').trigger('click')
    const picker = wrapper.findComponent(FormatSelectorDialog)
    expect(picker.props('open')).toBe(true)
    expect(picker.props('formats').map((f: { value: string }) => f.value)).toEqual(['csv', 'json'])
    // Selecting through the component's own picker uses its mirrored source
    picker.vm.$emit('select', 'csv')
    await flushPromises()
    expect(picker.props('open')).toBe(false)
    expect(window.electronAPI.files.saveResults).toHaveBeenCalledWith(
      's',
      'SELECT',
      'csv',
      'people'
    )

    push({
      ...selectState,
      queryType: 'ASK',
      results: { data: { boolean: true }, queryType: 'ASK' },
    })
    await flushPromises()
    saveResultsMenu?.()
    await flushPromises()
    expect(window.electronAPI.files.saveResults).toHaveBeenLastCalledWith(
      expect.any(String),
      'ASK',
      'json',
      'people'
    )
  })
})
