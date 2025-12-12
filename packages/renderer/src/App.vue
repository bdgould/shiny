<template>
  <div class="app">
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import TopBar from './components/layout/TopBar.vue'
import IconSidebar from './components/sidebar/IconSidebar.vue'
import MainPane from './components/layout/MainPane.vue'
import FormatSelectorDialog from './components/dialogs/FormatSelectorDialog.vue'
import { useConnectionStore } from './stores/connection'
import { useTabsStore } from './stores/tabs'
import type { QueryFileData } from './types/electron'

const connectionStore = useConnectionStore()
const tabsStore = useTabsStore()
const formatDialogRef = ref<InstanceType<typeof FormatSelectorDialog> | null>(null)
const exportFormats = ref<Array<{ value: string; label: string }>>([])

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

      // Find backend by ID or name
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
          alert(
            `Backend "${data.metadata.name}" not found in configuration. Please select a backend manually.`
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
    } catch (error) {
      console.error('Error handling file opened event:', error)
      alert(`Error opening file: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
</style>
