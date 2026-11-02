import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResultsExport } from '../useResultsExport'
import { useToast } from '../useToast'
import { useTabsStore } from '../../stores/tabs'

const selectResults = {
  data: { head: { vars: ['s'] }, results: { bindings: [] } },
}

describe('useResultsExport', () => {
  let saveResultsMock: ReturnType<typeof vi.fn>
  let tabsStore: ReturnType<typeof useTabsStore>
  const toast = useToast()

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    for (const t of [...toast.toasts.value]) toast.remove(t.id)
    // Picker state is module-global; reset it between tests
    useResultsExport().closePicker()
    saveResultsMock = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/out' })
    Object.assign(window, {
      electronAPI: { files: { saveResults: saveResultsMock, showInFolder: vi.fn() } },
    })
    tabsStore = useTabsStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns and does nothing when there are no results', async () => {
    tabsStore.createTab()
    const { requestSave, isPickerOpen, canSaveResults } = useResultsExport()
    expect(canSaveResults()).toBe(false)
    await requestSave()
    expect(isPickerOpen.value).toBe(false)
    expect(saveResultsMock).not.toHaveBeenCalled()
    expect(toast.toasts.value.map((t) => t.message)).toEqual([
      'No results to save. Execute a query first.',
    ])
  })

  it('saves directly when only one format applies', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, { data: { head: {}, boolean: true } }, 'ASK')
    const { requestSave, isPickerOpen, pickerTitle } = useResultsExport()
    await requestSave()
    // ASK offers JSON and XML, so the picker opens with the save title
    expect(isPickerOpen.value).toBe(true)
    expect(pickerTitle.value).toBe('Save results as')
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('skips the picker when exactly one format applies', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, { data: { head: {}, boolean: true } }, 'ASK')
    const { getAvailableFormats } = await import('../../utils/serializeResults')
    const mod = await import('../../utils/serializeResults')
    const spy = vi
      .spyOn(mod, 'getAvailableFormats')
      .mockReturnValue([{ value: 'json', label: 'JSON' }])
    try {
      const { requestSave, isPickerOpen } = useResultsExport()
      await requestSave()
      expect(isPickerOpen.value).toBe(false)
      expect(saveResultsMock).toHaveBeenCalledWith(expect.any(String), 'ASK', 'json', 'Untitled-1')
    } finally {
      spy.mockRestore()
      expect(getAvailableFormats('ASK')).toHaveLength(2)
    }
  })

  it('opens the picker for multi-format query types and saves the chosen one', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { requestSave, isPickerOpen, pickerFormats, selectFormat } = useResultsExport()
    await requestSave()
    expect(isPickerOpen.value).toBe(true)
    expect(pickerFormats.value.map((f) => f.value)).toEqual([
      'csv',
      'tsv',
      'json',
      'xml',
      'markdown',
    ])
    expect(saveResultsMock).not.toHaveBeenCalled()

    await selectFormat('json')
    expect(isPickerOpen.value).toBe(false)
    expect(saveResultsMock).toHaveBeenCalledWith(expect.any(String), 'SELECT', 'json', 'Untitled-1')
  })

  it('copies through the same picker with a copy title', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { requestCopy, isPickerOpen, pickerTitle, selectFormat } = useResultsExport()
    await requestCopy()
    expect(isPickerOpen.value).toBe(true)
    expect(pickerTitle.value).toBe('Copy results as')
    await selectFormat('tsv')
    expect(writeText).toHaveBeenCalledWith('?s')
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('copies directly when only one format applies and warns with no results', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { requestCopy, isPickerOpen, pickerTitle } = useResultsExport()
    tabsStore.createTab()
    await requestCopy()
    expect(toast.toasts.value.map((t) => t.message)).toEqual([
      'No results to copy. Execute a query first.',
    ])

    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, { data: { head: {}, boolean: true } }, 'ASK')
    // ASK now has two formats, so the picker opens; close it and check the title
    await requestCopy()
    expect(isPickerOpen.value).toBe(true)
    expect(pickerTitle.value).toBe('Copy results as')
  })

  it('closes the picker without saving', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { requestSave, isPickerOpen, closePicker } = useResultsExport()
    await requestSave()
    closePicker()
    expect(isPickerOpen.value).toBe(false)
    expect(saveResultsMock).not.toHaveBeenCalled()
  })
})
