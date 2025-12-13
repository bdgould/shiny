import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFileDragDrop } from '../useFileDragDrop'
import { useTabsStore } from '../../stores/tabs'
import { useConnectionStore } from '../../stores/connection'

// Mock alert
global.alert = vi.fn()

describe('useFileDragDrop', () => {
  let tabsStore: ReturnType<typeof useTabsStore>
  let connectionStore: ReturnType<typeof useConnectionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    tabsStore = useTabsStore()
    connectionStore = useConnectionStore()

    // Setup default backends
    connectionStore.backends = [
      {
        id: 'backend-1',
        name: 'Test Backend',
        type: 'sparql11',
        endpoint: 'http://example.org/sparql',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cacheConfig: {
          enabled: true,
          maxElements: 10000,
          ttl: 86400000,
          includeClasses: true,
          includeProperties: true,
          includeIndividuals: true
        }
      }
    ]
  })

  describe('handleDragOver', () => {
    it('should prevent default and set dropEffect', () => {
      const { handleDragOver } = useFileDragDrop()

      const event = new DragEvent('dragover', {
        dataTransfer: new DataTransfer()
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      handleDragOver(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(event.dataTransfer?.dropEffect).toBe('copy')
    })
  })

  describe('handleDrop', () => {
    it('should prevent default', async () => {
      const { handleDrop } = useFileDragDrop()

      const event = new DragEvent('drop', {
        dataTransfer: new DataTransfer()
      })

      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handleDrop(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should open valid .rq file in new tab', async () => {
      const { handleDrop } = useFileDragDrop()

      const fileContent = 'SELECT * WHERE { ?s ?p ?o }'
      const file = new File([fileContent], 'test.rq', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')
      const openFileInNewTabSpy = vi.spyOn(tabsStore, 'openFileInNewTab')

      await handleDrop(event)

      // Wait for file to be read
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(openFileInNewTabSpy).toHaveBeenCalledWith({
        content: fileContent,
        filePath: null,
        fileName: 'test',
        backendId: null
      })
    })

    it('should open valid .sparql file in new tab', async () => {
      const { handleDrop } = useFileDragDrop()

      const fileContent = 'SELECT * WHERE { ?s ?p ?o }'
      const file = new File([fileContent], 'query.sparql', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')
      const openFileInNewTabSpy = vi.spyOn(tabsStore, 'openFileInNewTab')

      await handleDrop(event)

      // Wait for file to be read
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(openFileInNewTabSpy).toHaveBeenCalledWith({
        content: fileContent,
        filePath: null,
        fileName: 'query',
        backendId: null
      })
    })

    it('should parse backend metadata from file', async () => {
      const { handleDrop } = useFileDragDrop()

      const fileContent = '# Shiny Backend: {"id":"backend-1","name":"Test Backend"}\nSELECT * WHERE { ?s ?p ?o }'
      const file = new File([fileContent], 'test.rq', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')
      const openFileInNewTabSpy = vi.spyOn(tabsStore, 'openFileInNewTab')

      await handleDrop(event)

      // Wait for file to be read
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(openFileInNewTabSpy).toHaveBeenCalledWith({
        content: 'SELECT * WHERE { ?s ?p ?o }',
        filePath: null,
        fileName: 'test',
        backendId: 'backend-1'
      })
    })

    it('should show alert when backend not found', async () => {
      const { handleDrop } = useFileDragDrop()

      const fileContent = '# Shiny Backend: {"id":"unknown-backend","name":"Unknown Backend"}\nSELECT * WHERE { ?s ?p ?o }'
      const file = new File([fileContent], 'test.rq', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')

      await handleDrop(event)

      // Wait for file to be read
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(global.alert).toHaveBeenCalledWith(
        expect.stringContaining('Backend "Unknown Backend" not found')
      )
    })

    it('should skip files with invalid extensions', async () => {
      const { handleDrop } = useFileDragDrop()

      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')
      const openFileInNewTabSpy = vi.spyOn(tabsStore, 'openFileInNewTab')

      await handleDrop(event)

      // Wait for file to be processed
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(openFileInNewTabSpy).not.toHaveBeenCalled()
    })

    it('should handle multiple files', async () => {
      const { handleDrop } = useFileDragDrop()

      const file1 = new File(['SELECT * WHERE { ?s ?p ?o }'], 'query1.rq', { type: 'text/plain' })
      const file2 = new File(['SELECT ?s WHERE { ?s a ?type }'], 'query2.sparql', { type: 'text/plain' })

      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file1)
      dataTransfer.items.add(file2)

      const event = new DragEvent('drop', {
        dataTransfer
      })

      vi.spyOn(event, 'preventDefault')
      const openFileInNewTabSpy = vi.spyOn(tabsStore, 'openFileInNewTab')

      await handleDrop(event)

      // Wait for files to be read
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(openFileInNewTabSpy).toHaveBeenCalledTimes(2)
    })
  })
})
