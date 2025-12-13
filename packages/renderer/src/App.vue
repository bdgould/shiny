<template>
  <div
    class="app"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <TopBar />
    <div class="app-content">
      <IconSidebar />
      <MainPane />
    </div>
    <FormatSelectorDialog
      ref="formatDialogRef"
      :formats="exportFormats"
      @select="handleFormatSelected"
    />

    <!-- Drag Overlay -->
    <Transition name="fade">
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-overlay-content">
          <div class="drag-overlay-icon">📄</div>
          <div class="drag-overlay-text">Drop a SPARQL query here to open in Shiny</div>
        </div>
      </div>
    </Transition>

    <!-- Loading Overlay -->
    <Transition name="fade">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading file...</div>
      </div>
    </Transition>

    <!-- Toast Container -->
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import TopBar from './components/layout/TopBar.vue'
import IconSidebar from './components/sidebar/IconSidebar.vue'
import MainPane from './components/layout/MainPane.vue'
import FormatSelectorDialog from './components/dialogs/FormatSelectorDialog.vue'
import ToastContainer from './components/ui/ToastContainer.vue'
import { useConnectionStore } from './stores/connection'
import { useTabsStore } from './stores/tabs'
import { useFileDragDrop } from './composables/useFileDragDrop'
import { useToast } from './composables/useToast'
import type { QueryFileData } from './types/electron'

const connectionStore = useConnectionStore()
const tabsStore = useTabsStore()
const formatDialogRef = ref<InstanceType<typeof FormatSelectorDialog> | null>(null)
const exportFormats = ref<Array<{ value: string; label: string }>>([])
const { warning, error } = useToast()

// Drag and drop functionality
const { isDragging, isLoading, handleDragEnter, handleDragLeave, handleDragOver, handleDrop } =
  useFileDragDrop()

// Will be set in onMounted
let saveResultsFunction: ((format: string) => Promise<void>) | null = null

async function handleFormatSelected(format: string) {
  if (saveResultsFunction) {
    await saveResultsFunction(format)
  }
}

// Load backends and restore tabs on app startup
onMounted(async () => {
  try {
    // Load backends first
    await connectionStore.loadBackends()

    // Restore tabs from previous session
    tabsStore.restoreFromLocalStorage()

    // Initialize background cache refresh
    const { useCacheRefresh } = await import('./composables/useCacheRefresh')
    useCacheRefresh()
  } catch (error) {
    console.error('Failed to initialize app on startup:', error)
  }
})

// Listen for files opened via OS (double-click .rq file)
let removeFileOpenedListener: (() => void) | null = null
let removeMenuNewListener: (() => void) | null = null
let removeMenuSaveListener: (() => void) | null = null
let removeMenuOpenListener: (() => void) | null = null
let removeMenuSaveResultsListener: (() => void) | null = null

onMounted(async () => {
  // Import file operations composable
  const { useFileOperations } = await import('./composables/useFileOperations')
  const { useResultsSave } = await import('./composables/useResultsSave')
  const { saveQuery, openQuery } = useFileOperations()
  const { canSaveResults, getExportFormats, saveResults } = useResultsSave()

  // Listen for native menu events
  removeMenuNewListener = window.electronAPI.menu.onNewQuery(() => {
    tabsStore.createTab()
  })

  removeMenuSaveListener = window.electronAPI.menu.onSaveQuery(async () => {
    await saveQuery()
  })

  removeMenuOpenListener = window.electronAPI.menu.onOpenQuery(async () => {
    await openQuery()
  })

  // Store saveResults function for use by handleFormatSelected
  saveResultsFunction = saveResults

  removeMenuSaveResultsListener = window.electronAPI.menu.onSaveResults(async () => {
    await handleSaveResultsMenu()
  })

  async function handleSaveResultsMenu() {
    if (!canSaveResults()) {
      alert('No results to save. Please execute a query first.')
      return
    }

    const formats = getExportFormats()

    // If only one format available (ASK queries), save directly
    if (formats.length === 1) {
      await saveResults(formats[0].value)
    } else {
      // Show format selection dialog
      exportFormats.value = formats
      formatDialogRef.value?.open()
    }
  }

  // Listen for files opened via OS (double-click .rq file)
  removeFileOpenedListener = window.electronAPI.files.onFileOpened(async (data: QueryFileData) => {
    try {
      // Extract filename from file path
      const fileName = data.filePath.split('/').pop()?.replace(/\.rq$/, '') || 'Untitled'

      // Find backend by ID or name - always default to null if not found
      let backendId: string | null = null
      if (data.metadata) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let backend = connectionStore.backends.find((b) => b.id === data.metadata!.id)
        if (!backend) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          backend = connectionStore.backends.find((b) => b.name === data.metadata!.name)
        }

        if (backend) {
          backendId = backend.id
        } else {
          // Show non-blocking warning and default to empty
          warning(
            `Backend "${data.metadata.name}" not found. Please select a backend manually.`,
            5000
          )
        }
      }

      // Create new tab with file content
      tabsStore.openFileInNewTab({
        content: data.content,
        filePath: data.filePath,
        fileName,
        backendId,
      })

      // eslint-disable-next-line no-console
      console.log('File opened successfully via OS:', data.filePath)
    } catch (err) {
      console.error('Error handling file opened event:', err)
      error(`Error opening file: ${err instanceof Error ? err.message : 'Unknown error'}`, 5000)
    }
  })
})

onUnmounted(() => {
  if (removeFileOpenedListener) {
    removeFileOpenedListener()
  }
  if (removeMenuNewListener) {
    removeMenuNewListener()
  }
  if (removeMenuSaveListener) {
    removeMenuSaveListener()
  }
  if (removeMenuOpenListener) {
    removeMenuOpenListener()
  }
  if (removeMenuSaveResultsListener) {
    removeMenuSaveResultsListener()
  }
})
</script>

<style scoped>
.app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Drag Overlay Styles */
.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  background-color: rgba(59, 130, 246, 0.15);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
  border: 2px dashed rgba(59, 130, 246, 0.5);
  border-radius: 12px;
  background-color: rgba(255, 255, 255, 0.95);
}

.drag-overlay-icon {
  font-size: 64px;
  opacity: 0.7;
}

.drag-overlay-text {
  font-size: 18px;
  font-weight: 500;
  color: #1e40af;
  text-align: center;
}

/* Loading Overlay Styles */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  color: white;
  font-size: 16px;
  font-weight: 500;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Fade Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
