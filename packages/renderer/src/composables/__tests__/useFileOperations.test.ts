import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFileOperations } from '../useFileOperations'
import { useTabsStore } from '../../stores/tabs'
import { useConnectionStore } from '../../stores/connection'
import type { BackendConfig } from '../../types/backends'

function backend(id: string, name: string): BackendConfig {
  return {
    id,
    name,
    type: 'sparql-1.1',
    endpoint: 'http://localhost:3030/ds',
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('useFileOperations', () => {
  let saveQuery: ReturnType<typeof vi.fn>
  let openQuery: ReturnType<typeof vi.fn>
  let alertMock: ReturnType<typeof vi.fn>
  let tabsStore: ReturnType<typeof useTabsStore>
  let connectionStore: ReturnType<typeof useConnectionStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    saveQuery = vi.fn()
    openQuery = vi.fn()
    alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    Object.assign(window, { electronAPI: { files: { saveQuery, openQuery } } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tabsStore = useTabsStore()
    connectionStore = useConnectionStore()
    connectionStore.backends = [backend('b1', 'Fuseki'), backend('b2', 'GraphDB')]
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('saveQuery', () => {
    it('alerts when there is no active tab', async () => {
      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('No active tab to save')
    })

    it('alerts when the query is blank', async () => {
      tabsStore.createTab({ query: '   ' })
      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('No query to save')
      expect(saveQuery).not.toHaveBeenCalled()
    })

    it('saves with backend metadata and marks the tab saved', async () => {
      tabsStore.createTab({ query: 'SELECT * {}', backendId: 'b2' })
      saveQuery.mockResolvedValue({ success: true, filePath: '/home/me/queries/people.rq' })

      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(true)
      expect(saveQuery).toHaveBeenCalledWith(
        'SELECT * {}',
        { id: 'b2', name: 'GraphDB' },
        undefined
      )

      const tab = tabsStore.activeTab
      expect(tab?.name).toBe('people')
      expect(tab?.filePath).toBe('/home/me/queries/people.rq')
      expect(tab?.isDirty).toBe(false)
      expect(tab?.savedContent).toBe('SELECT * {}')
    })

    it('passes the existing file path and null metadata for an unknown backend', async () => {
      tabsStore.createTab({
        query: 'ASK {}',
        backendId: 'missing',
        filePath: '/existing/q.rq',
      })
      saveQuery.mockResolvedValue({ success: true, filePath: '/existing/q.rq' })

      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(true)
      expect(saveQuery).toHaveBeenCalledWith('ASK {}', null, '/existing/q.rq')
    })

    it('alerts when the save fails', async () => {
      tabsStore.createTab({ query: 'ASK {}' })
      saveQuery.mockResolvedValue({ success: false, error: 'Cancelled' })
      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('Failed to save query: Cancelled')
    })

    it('alerts with a generic message when success lacks a file path', async () => {
      tabsStore.createTab({ query: 'ASK {}' })
      saveQuery.mockResolvedValue({ success: true })
      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('Failed to save query: Unknown error')
    })

    it('alerts when the IPC call throws', async () => {
      tabsStore.createTab({ query: 'ASK {}' })
      saveQuery.mockRejectedValue(new Error('IPC down'))
      const ops = useFileOperations()
      expect(await ops.saveQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('Error saving query: IPC down')
    })
  })

  describe('openQuery', () => {
    it('silently returns false when the user cancels', async () => {
      openQuery.mockResolvedValue({ error: 'No file selected' })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(false)
      expect(alertMock).not.toHaveBeenCalled()
    })

    it('alerts on other open errors', async () => {
      openQuery.mockResolvedValue({ error: 'Permission denied' })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('Failed to open query: Permission denied')
    })

    it('opens the file in a new tab matching backend by id', async () => {
      openQuery.mockResolvedValue({
        content: 'SELECT ?s {}',
        filePath: '/q/find-things.rq',
        metadata: { id: 'b1', name: 'Renamed' },
      })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(true)

      const tab = tabsStore.activeTab
      expect(tab?.name).toBe('find-things')
      expect(tab?.query).toBe('SELECT ?s {}')
      expect(tab?.filePath).toBe('/q/find-things.rq')
      expect(tab?.backendId).toBe('b1')
      expect(tab?.isDirty).toBe(false)
      expect(alertMock).not.toHaveBeenCalled()
    })

    it('falls back to matching backend by name', async () => {
      openQuery.mockResolvedValue({
        content: 'q',
        filePath: '/q/x.rq',
        metadata: { id: 'other-id', name: 'GraphDB' },
      })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(true)
      expect(tabsStore.activeTab?.backendId).toBe('b2')
    })

    it('notifies when the backend cannot be found', async () => {
      openQuery.mockResolvedValue({
        content: 'q',
        filePath: '/q/x.rq',
        metadata: { id: 'nope', name: 'Ghost' },
      })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(true)
      expect(tabsStore.activeTab?.backendId).toBeNull()
      expect(alertMock).toHaveBeenCalledWith(
        'Backend "Ghost" not found in configuration. Please select a backend manually.'
      )
    })

    it('opens files without metadata', async () => {
      openQuery.mockResolvedValue({ content: 'q', filePath: '/q/plain.rq', metadata: null })
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(true)
      expect(tabsStore.activeTab?.name).toBe('plain')
      expect(tabsStore.activeTab?.backendId).toBeNull()
    })

    it('alerts when the IPC call throws a non-Error', async () => {
      openQuery.mockRejectedValue('nope')
      const ops = useFileOperations()
      expect(await ops.openQuery()).toBe(false)
      expect(alertMock).toHaveBeenCalledWith('Error opening query: Unknown error')
    })
  })
})
