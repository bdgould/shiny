import { ref } from 'vue'
import { useTabsStore } from '../stores/tabs'
import { useConnectionStore } from '../stores/connection'
import { useToast } from './useToast'
import type { BackendMetadata } from '../types/electron'

export function useFileDragDrop() {
  const tabsStore = useTabsStore()
  const connectionStore = useConnectionStore()
  const { warning, error } = useToast()

  const isDragging = ref(false)
  const isLoading = ref(false)
  const dragCounter = ref(0)

  /**
   * Parse query file content and extract metadata
   * Matches the logic from FileService.parseQueryFile
   */
  function parseQueryFile(fileContent: string): {
    content: string
    metadata: BackendMetadata | null
  } {
    const lines = fileContent.split('\n')
    let metadata: BackendMetadata | null = null
    let contentStartIndex = 0

    // Check first line for metadata comment
    if (lines.length > 0 && lines[0].trim().startsWith('# Shiny Backend:')) {
      try {
        const metadataLine = lines[0].trim()
        const jsonStart = metadataLine.indexOf('{')
        if (jsonStart !== -1) {
          const jsonStr = metadataLine.substring(jsonStart)
          metadata = JSON.parse(jsonStr)
        }
        contentStartIndex = 1
      } catch (error) {
        console.warn('Failed to parse backend metadata:', error)
      }
    }

    // Extract query content (everything after metadata line)
    const content = lines.slice(contentStartIndex).join('\n').trim()

    return { content, metadata }
  }

  /**
   * Find a backend that matches the metadata
   */
  function findBackendFromMetadata(metadata: BackendMetadata) {
    // Try to find by ID first (exact match)
    let backend = connectionStore.backends.find((b) => b.id === metadata.id)

    // If not found by ID, try to find by name
    if (!backend) {
      backend = connectionStore.backends.find((b) => b.name === metadata.name)
    }

    return backend || null
  }

  /**
   * Check if a file has a valid SPARQL extension (.rq or .sparql)
   */
  function isValidSparqlFile(fileName: string): boolean {
    return fileName.endsWith('.rq') || fileName.endsWith('.sparql')
  }

  /**
   * Handle dropped files
   */
  async function handleFileDrop(files: FileList): Promise<void> {
    isLoading.value = true

    try {
      // Process each dropped file
      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Check file extension
        if (!isValidSparqlFile(file.name)) {
          console.warn(`Skipping file with invalid extension: ${file.name}`)
          warning(`Skipped "${file.name}" - only .rq and .sparql files are supported`)
          continue
        }

        try {
          // Read file content
          const fileContent = await readFileAsText(file)

          // Parse file content and metadata
          const { content, metadata } = parseQueryFile(fileContent)

          // Extract filename without extension
          const fileName = file.name.replace(/\.(rq|sparql)$/, '')

          // Find backend by metadata - always default to null if not found
          let backendId: string | null = null
          if (metadata) {
            const backend = findBackendFromMetadata(metadata)

            if (backend) {
              backendId = backend.id
            } else {
              // Show non-blocking warning and default to empty
              warning(
                `Backend "${metadata.name}" not found. Please select a backend manually.`,
                5000
              )
            }
          }

          // Create new tab with file content
          // Note: filePath is not available from drag-drop, so it remains null
          // The file is treated as unsaved until the user explicitly saves it
          tabsStore.openFileInNewTab({
            content,
            filePath: null, // No file path for drag-dropped files
            fileName,
            backendId,
          })

          console.log('File opened successfully via drag-drop:', file.name)
        } catch (err) {
          console.error('Error handling dropped file:', err)
          error(
            `Error opening file "${file.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
            5000
          )
        }
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Read a file as text using FileReader
   */
  function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (event) => {
        const result = event.target?.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new Error('Failed to read file as text'))
        }
      }

      reader.onerror = () => {
        reject(new Error('File read error'))
      }

      reader.readAsText(file)
    })
  }

  /**
   * Handle drag enter event - show overlay
   */
  function handleDragEnter(event: DragEvent): void {
    event.preventDefault()
    dragCounter.value++

    // Only show overlay for file drags
    if (event.dataTransfer?.types.includes('Files')) {
      isDragging.value = true
    }
  }

  /**
   * Handle drag leave event - hide overlay
   */
  function handleDragLeave(event: DragEvent): void {
    event.preventDefault()
    dragCounter.value--

    // Only hide when we've left all drag zones
    if (dragCounter.value === 0) {
      isDragging.value = false
    }
  }

  /**
   * Handle dragover event (must prevent default to enable drop)
   */
  function handleDragOver(event: DragEvent): void {
    event.preventDefault()

    // Only show drop effect for files
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  /**
   * Handle drop event
   */
  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault()

    // Reset drag state
    isDragging.value = false
    dragCounter.value = 0

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) {
      return
    }

    await handleFileDrop(files)
  }

  return {
    isDragging,
    isLoading,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  }
}
