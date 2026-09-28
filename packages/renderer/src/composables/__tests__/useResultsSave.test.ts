import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResultsSave } from '../useResultsSave'
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
  let alertMock: ReturnType<typeof vi.fn>
  let tabsStore: ReturnType<typeof useTabsStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveResultsMock = vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/out.csv' })
    alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    Object.assign(window, {
      electronAPI: { files: { saveResults: saveResultsMock } },
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tabsStore = useTabsStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports nothing to save when there is no active tab', async () => {
    const { canSaveResults, getExportFormats, saveResults } = useResultsSave()
    expect(canSaveResults()).toBe(false)
    expect(getExportFormats()).toEqual([])
    expect(await saveResults('csv')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith('No active tab')
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('reports no results when the active tab has not been executed', async () => {
    tabsStore.createTab({ query: 'SELECT * {}' })
    const { canSaveResults, getExportFormats, saveResults } = useResultsSave()
    expect(canSaveResults()).toBe(false)
    expect(getExportFormats()).toEqual([])
    expect(await saveResults('csv')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith('No results to save')
  })

  it('offers formats for the active query type', () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { canSaveResults, getExportFormats } = useResultsSave()
    expect(canSaveResults()).toBe(true)
    expect(getExportFormats().map((f) => f.value)).toEqual(['csv', 'json'])
  })

  it('serializes results and passes them to the save IPC', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('csv')).toBe(true)
    expect(saveResultsMock).toHaveBeenCalledWith(
      's,label\nhttp://ex.org/a,"A, ""x"""',
      'SELECT',
      'csv'
    )
    expect(alertMock).not.toHaveBeenCalled()
  })

  it('alerts when the save IPC reports failure', async () => {
    saveResultsMock.mockResolvedValueOnce({ success: false, error: 'Disk full' })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('json')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith('Failed to save results: Disk full')
  })

  it('uses a generic message when failure has no error text', async () => {
    saveResultsMock.mockResolvedValueOnce({ success: false })
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('json')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith('Failed to save results: Unknown error')
  })

  it('alerts when serialization throws (unsupported format)', async () => {
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('turtle')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith(
      'Error saving results: Unsupported format "turtle" for SELECT query'
    )
    expect(saveResultsMock).not.toHaveBeenCalled()
  })

  it('handles non-Error rejections', async () => {
    saveResultsMock.mockRejectedValueOnce('boom')
    const id = tabsStore.createTab()
    tabsStore.setTabResults(id, selectResults, 'SELECT')
    const { saveResults } = useResultsSave()

    expect(await saveResults('csv')).toBe(false)
    expect(alertMock).toHaveBeenCalledWith('Error saving results: Unknown error')
  })
})
