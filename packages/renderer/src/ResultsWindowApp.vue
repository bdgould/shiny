<template>
  <div class="results-window">
    <header class="results-window-header">
      <div class="results-window-title">
        <h3>Results</h3>
        <span v-if="state.tabName" class="tab-name">{{ state.tabName }}</span>
      </div>
      <div class="results-actions">
        <button
          class="btn-icon"
          title="Save results…"
          :disabled="!canSaveResults()"
          @click="requestSave"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1v8.6l2.8-2.8 1 1L8 11.6 4.2 7.8l1-1L8 9.6V1z" />
            <path d="M2 11h1.5v2.5h9V11H14v4H2z" />
          </svg>
        </button>
        <button class="btn-secondary btn-pop-in" title="Pop back in" @click="popIn">
          Pop back in
        </button>
      </div>
    </header>

    <div class="results-content">
      <div v-if="state.isExecuting" class="loading">Executing query...</div>
      <div v-else-if="state.error" class="error">{{ state.error }}</div>
      <div v-else-if="state.results" class="results">
        <ResultsView :results="state.results" :query-type="queryType" />
      </div>
      <div v-else class="empty">No results yet. Execute a query in the main window.</div>
    </div>

    <FormatSelectorDialog
      :formats="pickerFormats"
      :open="isPickerOpen"
      @select="selectFormat"
      @close="closePicker"
    />
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import ResultsView from './components/results/ResultsView.vue'
import FormatSelectorDialog from './components/dialogs/FormatSelectorDialog.vue'
import ToastContainer from './components/ui/ToastContainer.vue'
import { useResultsExport } from './composables/useResultsExport'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import type { QueryType } from './services/sparql/queryDetector'
import type { ResultsWindowState } from './types/electron'

/**
 * Root of the popped-out results window. It never touches the tabs store or
 * the tabs session in localStorage; everything it shows arrives as snapshots
 * published by the main window.
 */
const api = window.electronAPI.resultsWindow

const state = reactive<ResultsWindowState>({
  tabName: '',
  queryType: null,
  results: null,
  error: null,
  isExecuting: false,
})

const queryType = computed(() => state.queryType as QueryType | null)

const { canSaveResults, requestSave, selectFormat, closePicker, pickerFormats, isPickerOpen } =
  useResultsExport(() => ({
    name: state.tabName,
    results: state.results,
    queryType: queryType.value,
  }))

function popIn() {
  void api.close()
}

// Cmd/Ctrl+Enter re-runs the active query in the main window
useKeyboardShortcuts([{ key: 'Enter', ctrlOrCmd: true, callback: () => void api.execute() }])

watch(
  () => state.tabName,
  (name) => {
    document.title = name ? `Results: ${name}` : 'Results'
  },
  { immediate: true }
)

let removeState: (() => void) | null = null
let removeSaveResults: (() => void) | null = null

onMounted(() => {
  removeState = api.onState((next) => Object.assign(state, next))
  removeSaveResults = window.electronAPI.menu.onSaveResults(() => void requestSave())
  // Ask the main window for the current snapshot
  void api.ready()
})

onUnmounted(() => {
  removeState?.()
  removeSaveResults?.()
})
</script>

<style scoped>
.results-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-bg-main);
}

.results-window-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.results-window-title {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
}

.results-window-title h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.tab-name {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.results-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  background: transparent;
  color: var(--color-text-secondary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background: var(--color-bg-main);
  color: var(--color-text-primary);
}

.btn-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.375rem 0.75rem;
  background: var(--color-bg-main);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-text-secondary);
}

.results-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  min-height: 0;
}

.results {
  height: 100%;
}

.loading,
.error,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}

.error {
  color: var(--color-error);
}
</style>
