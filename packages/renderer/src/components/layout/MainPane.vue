<template>
  <main class="main-pane">
    <div class="editor-section" :style="{ height: isSettingsTab ? '100%' : editorHeight }">
      <TabBar />

      <!-- Settings view for settings tabs -->
      <template v-if="isSettingsTab">
        <QuerySettingsView v-if="tabsStore.activeTab?.settingsType === 'query'" />
        <AISettingsView v-else-if="tabsStore.activeTab?.settingsType === 'ai'" />
        <CacheSettingsView v-else-if="tabsStore.activeTab?.settingsType === 'cache'" />
      </template>

      <!-- Query editor for regular tabs -->
      <template v-else>
        <div class="editor-controls">
          <select v-model="activeTabBackend" class="backend-select" @change="handleBackendChange">
            <option :value="null" disabled>Select backend...</option>
            <option v-for="backend in connectionStore.backends" :key="backend.id" :value="backend.id">
              {{ backend.name }}
            </option>
          </select>
          <button class="btn-primary" :disabled="!activeTabBackend" @click="executeQuery">
            Execute <span class="shortcut-hint">{{ shortcutHint }}</span>
          </button>
        </div>
        <MonacoSparqlEditor />
      </template>
    </div>

    <!-- Results section - only show for query tabs, not settings tabs -->
    <template v-if="!isSettingsTab">
      <div
        v-if="!isResultsCollapsed"
        class="resizer"
        :class="{ resizing: isResizing }"
        @mousedown="startResize"
      >
        <div class="resizer-line"></div>
      </div>

      <div v-if="!isResultsCollapsed" class="results-section" :style="{ height: resultsHeight }">
        <div class="results-header">
          <h3>Results</h3>
          <button class="btn-icon" title="Collapse results" @click="toggleResultsCollapse">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 11L3 6h10l-5 5z" />
            </svg>
          </button>
        </div>
        <div class="results-content">
          <div v-if="queryStore.isExecuting" class="loading">Executing query...</div>
          <div v-else-if="queryStore.error" class="error">
            {{ queryStore.error }}
          </div>
          <div v-else-if="queryStore.results" class="results">
            <ResultsView />
          </div>
          <div v-else class="empty">No results yet. Write a query and click Execute.</div>
        </div>
      </div>

      <div v-else class="results-collapsed">
        <button class="btn-expand" title="Expand results" @click="toggleResultsCollapse">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 5l5 5H3l5-5z" />
          </svg>
          <span>Results</span>
        </button>
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useQueryStore } from '@/stores/query'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionStore } from '@/stores/connection'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import TabBar from '@/components/tabs/TabBar.vue'
import MonacoSparqlEditor from '@/components/editor/MonacoSparqlEditor.vue'
import ResultsView from '@/components/results/ResultsView.vue'
import QuerySettingsView from '@/components/settings/QuerySettingsView.vue'
import AISettingsView from '@/components/settings/AISettingsView.vue'
import CacheSettingsView from '@/components/settings/CacheSettingsView.vue'

const queryStore = useQueryStore()
const tabsStore = useTabsStore()
const connectionStore = useConnectionStore()

// Check if current tab is a settings tab
const isSettingsTab = computed(() => tabsStore.activeTab?.isSettings ?? false)

// Per-tab backend selection
const activeTabBackend = computed({
  get: () => tabsStore.activeTab?.backendId ?? null,
  set: (backendId: string | null) => {
    if (tabsStore.activeTab) {
      tabsStore.setTabBackend(tabsStore.activeTab.id, backendId)
    }
  },
})

function handleBackendChange() {
  // Backend is now per-tab, stored in tabs store
  // No need for additional persistence
}

// Register keyboard shortcut: Cmd+Enter (Mac) or Ctrl+Enter (Win/Linux)
useKeyboardShortcuts([
  {
    key: 'Enter',
    ctrlOrCmd: true,
    callback: executeQuery,
  },
])

// Platform detection for keyboard shortcut hint
const isMac = ref(navigator.platform.toUpperCase().indexOf('MAC') >= 0)
const shortcutHint = computed(() => (isMac.value ? '⌘↩' : 'Ctrl+↵'))

// Results panel state
const isResultsCollapsed = ref(false)
const resultsHeightPx = ref(300) // Default 300px
const isResizing = ref(false)

const editorHeight = computed(() => {
  if (isResultsCollapsed.value) {
    return 'calc(100% - 32px)' // Full height minus collapsed bar
  }
  return `calc(100% - ${resultsHeightPx.value}px - 6px)` // 6px for resizer
})

const resultsHeight = computed(() => `${resultsHeightPx.value}px`)

function toggleResultsCollapse() {
  isResultsCollapsed.value = !isResultsCollapsed.value
}

// Resize functionality
let startY = 0
let startHeight = 0

function startResize(event: MouseEvent) {
  isResizing.value = true
  startY = event.clientY
  startHeight = resultsHeightPx.value

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return

  const deltaY = startY - event.clientY // Inverted because we're dragging up/down
  const newHeight = Math.max(100, startHeight + deltaY) // No max constraint - can expand to full height
  resultsHeightPx.value = newHeight
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

async function executeQuery() {
  await queryStore.executeQuery()
  // Auto-expand results when query executes
  if (isResultsCollapsed.value) {
    isResultsCollapsed.value = false
  }
}

// Cleanup on unmount
onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.main-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.editor-section {
  display: flex;
  flex-direction: column;
  min-height: 200px;
  overflow: hidden;
}

.results-section {
  display: flex;
  flex-direction: column;
  min-height: 100px;
  overflow: hidden;
}

/* Resizer */
.resizer {
  height: 6px;
  background: var(--color-border);
  cursor: ns-resize;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;
}

.resizer:hover,
.resizer.resizing {
  background: var(--color-primary);
}

.resizer-line {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 2px;
  background: var(--color-text-secondary);
  border-radius: 1px;
  opacity: 0.5;
}

.resizer:hover .resizer-line,
.resizer.resizing .resizer-line {
  opacity: 1;
  background: white;
}

/* Collapsed results bar */
.results-collapsed {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-header);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.btn-expand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: transparent;
  color: var(--color-text-secondary);
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-expand:hover {
  background: var(--color-bg-main);
  color: var(--color-text-primary);
}

.btn-expand svg {
  transition: transform 0.2s;
}

.editor-header,
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.editor-header h3,
.results-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.execution-controls,
.editor-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.editor-controls {
  padding: 0.5rem 1rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
}

.backend-select {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;
  min-width: 180px;
}

.backend-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.backend-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-primary:active {
  transform: translateY(1px);
}

.shortcut-hint {
  opacity: 0.7;
  font-size: 0.75rem;
  margin-left: 0.5rem;
  font-weight: 400;
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

.btn-icon:hover {
  background: var(--color-bg-main);
  color: var(--color-text-primary);
}

.results-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  background: var(--color-bg-main);
  min-height: 0;
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

.results pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--color-text-primary);
}

/* Prevent text selection during resize */
.resizing {
  user-select: none;
}
</style>
