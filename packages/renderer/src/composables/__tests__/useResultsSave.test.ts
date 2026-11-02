import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResultsSave, fileBaseName } from '../useResultsSave'
import { useToast } from '../useToast'
import { useTabsStore } from '../../stores/tabs'

const selectResults = {
  data: {
    head: { vars: ['s', 'label'] },
    results: {
      bindings: [
        {
          s: { type: 'uri', value: 'http://ex.org/a' },
          label: { type: 'literal', value: 'A, "x"' },
        },
      ],
    },
  },
}

describe('useResultsSave', () => {
  let saveResultsMock: ReturnType<typeof vi.fn>
  let showInFolderMock: ReturnType<typeof vi.fn>
  let tabsStore: ReturnType<typeof useTabsStore>
  const toast = useToast()

  function messages() {
    return toast.toasts.value.map((t) => [t.type, t.message])
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    for (const t of [...toast.toasts.value]) toast.remove(t.id)
    saveResultsMock = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/out.csv' })
    showInFolderMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, {
      electronAPI: { files: { saveResults: saveResultsMock, showInFolder: showInFolderMock } },
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tabsStore = useTabsStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports nothing to save when there is no active tab', async () => {
    const { canSaveResults, getExportFormats, saveResults } = useResultsSave()
    expect(canSaveResults()).toBe(false)
    expect(getExportFormats()).toEqual([])
    expect(await saveResults('csv')).toBe(false)
    expect(messages()).toEqual([['warning', 'No active tab']])
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('reports no results when the active tab has not been executed', async () => {
    tabsStore.createTab({ query: 'SELECT * {}' })
    const { canSaveResults, getExportFormats, saveResults } = useResultsSave()
    expect(canSaveResults()).toBe(false)
    expect(getExportFormats()).toEqual([])
    expect(await saveResults('csv')).toBe(false)
    expect(messages()).toEqual([['warning', 'No results to save. Execute a query first.']])
  })

  it('offers formats for the active query type', () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { canSaveResults, getExportFormats } = useResultsSave()
    expect(canSaveResults()).toBe(true)
    expect(getExportFormats().map((f) => f.value)).toEqual(['csv', 'json'])
  })

  it('serializes results, names the file after the tab, and confirms with a toast', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('csv')).toBe(true)
    expect(saveResultsMock).toHaveBeenCalledWith(
      's,label\nhttp://ex.org/a,"A, ""x"""',
      'SELECT',
      'csv',
      'Untitled-1'
    )
    expect(messages()).toEqual([['success', 'Saved results to out.csv']])
  })

  it('offers to reveal the saved file from the success toast', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    await saveResults('csv')
    const action = toast.toasts.value[0].action
    expect(action?.label).toBe('Reveal')
    action?.onClick()
    expect(showInFolderMock).toHaveBeenCalledWith('/tmp/out.csv')
  })

  it('shows an error toast when the save IPC reports failure', async () => {
    saveResultsMock.mockResolvedValueOnce({ success: false, error: 'Disk full' })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('json')).toBe(false)
    expect(messages()).toEqual([['error', 'Failed to save results: Disk full']])
  })

  it('uses a generic message when failure has no error text', async () => {
    saveResultsMock.mockResolvedValueOnce({ success: false })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('json')).toBe(false)
    expect(messages()).toEqual([['error', 'Failed to save results: Unknown error']])
  })

  it('stays silent when the user cancels the save dialog', async () => {
    saveResultsMock.mockResolvedValueOnce({ success: false, canceled: true })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('json')).toBe(false)
    expect(messages()).toEqual([])
  })

  it('shows an error toast when serialization throws (unsupported format)', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('turtle')).toBe(false)
    expect(messages()).toEqual([
      ['error', 'Error saving results: Unsupported format "turtle" for SELECT query'],
    ])
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('handles non-Error rejections', async () => {
    saveResultsMock.mockRejectedValueOnce('boom')
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('csv')).toBe(false)
    expect(messages()).toEqual([['error', 'Error saving results: Unknown error']])
  })
})

describe('fileBaseName', () => {
  it.each([
    ['/tmp/out.csv', 'out.csv'],
    ['C:\\Users\\me\\out.csv', 'out.csv'],
    ['out.csv', 'out.csv'],
  ])('extracts the file name from %s', (input, expected) => {
    expect(fileBaseName(input)).toBe(expected)
  })
})
