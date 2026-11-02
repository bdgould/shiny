<template>
  <div class="results-view">
    <!-- Query Type Badge -->
    <div v-if="queryType" class="query-type-badge">
      {{ queryType }}
    </div>

    <!-- View Toggle Toolbar -->
    <div class="view-toolbar">
      <!-- SELECT query views -->
      <template v-if="queryType === 'SELECT'">
        <button
          :class="{ active: currentView === 'table' }"
          class="view-button"
          @click="queryStore.setSelectView('table')"
        >
          <TableIcon />
          <span>Table</span>
        </button>
        <button
          :class="{ active: currentView === 'json' }"
          class="view-button"
          @click="queryStore.setSelectView('json')"
        >
          <CodeIcon />
          <span>JSON</span>
        </button>
      </template>

      <!-- CONSTRUCT/DESCRIBE query views -->
      <template v-if="isConstruct">
        <button
          :class="{ active: currentView === 'entity-table' }"
          class="view-button"
          @click="queryStore.setConstructView('entity-table')"
        >
          <TableIcon />
          <span>Entity View</span>
        </button>
        <button
          :class="{ active: currentView === 'turtle' }"
          class="view-button"
          @click="queryStore.setConstructView('turtle')"
        >
          <span>Turtle</span>
        </button>
        <button
          :class="{ active: currentView === 'ntriples' }"
          class="view-button"
          @click="queryStore.setConstructView('ntriples')"
        >
          <span>N-Triples</span>
        </button>
        <button
          :class="{ active: currentView === 'nquads' }"
          class="view-button"
          @click="queryStore.setConstructView('nquads')"
        >
          <span>N-Quads</span>
        </button>
        <button
          :class="{ active: currentView === 'jsonld' }"
          class="view-button"
          @click="queryStore.setConstructView('jsonld')"
        >
          <span>JSON-LD</span>
        </button>
      </template>

      <!-- ASK query views -->
      <template v-if="queryType === 'ASK'">
        <button
          :class="{ active: currentView === 'badge' }"
          class="view-button"
          @click="queryStore.setAskView('badge')"
        >
          <span>Badge</span>
        </button>
        <button
          :class="{ active: currentView === 'json' }"
          class="view-button"
          @click="queryStore.setAskView('json')"
        >
          <CodeIcon />
          <span>JSON</span>
        </button>
      </template>
    </div>

    <!-- Dynamic View Rendering -->
    <div class="view-content">
      <!-- SELECT views -->
      <SelectTableView
        v-if="queryType === 'SELECT' && currentView === 'table'"
        :results="results.data"
      />
      <JsonView v-else-if="queryType === 'SELECT' && currentView === 'json'" :data="results.data" />

      <!-- CONSTRUCT/DESCRIBE views -->
      <ConstructEntityTableView
        v-else-if="isConstruct && currentView === 'entity-table'"
        :turtle-data="results.data"
      />
      <RdfSerializationView
        v-else-if="isConstruct && constructSerializationFormat"
        :turtle-data="results.data"
        :format="constructSerializationFormat"
      />

      <!-- ASK views -->
      <AskBadgeView
        v-else-if="queryType === 'ASK' && currentView === 'badge'"
        :result="results.data"
      />
      <JsonView v-else-if="queryType === 'ASK' && currentView === 'json'" :data="results.data" />

      <!-- Fallback for unknown query types -->
      <JsonView v-else :data="results" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useQueryStore } from '@/stores/query'
import { VIEW_PREFERENCES_STORAGE_KEY } from '@/services/preferences/viewPreferences'
import type { QueryType } from '@/services/sparql/queryDetector'
import type { QueryResult } from '@/types/electron'
import TableIcon from './icons/TableIcon.vue'
import CodeIcon from './icons/CodeIcon.vue'
import SelectTableView from './SelectTableView.vue'
import ConstructEntityTableView from './ConstructEntityTableView.vue'
import RdfSerializationView from './RdfSerializationView.vue'
import AskBadgeView from './AskBadgeView.vue'
import JsonView from './JsonView.vue'

/**
 * Results are passed in rather than read from the active tab so the same view
 * can render inside the main window or a popped-out results window.
 */
const props = defineProps<{
  results: QueryResult
  queryType: QueryType | null
}>()

// View preferences (table vs JSON, etc.) stay global in the query store
const queryStore = useQueryStore()

// The main window and the popped-out results window share localStorage, so a
// view toggle in one is picked up by the other through the storage event.
function handleStorage(event: StorageEvent) {
  if (event.key === null || event.key === VIEW_PREFERENCES_STORAGE_KEY) {
    queryStore.reloadViewPreferences()
  }
}
onMounted(() => window.addEventListener('storage', handleStorage))
onUnmounted(() => window.removeEventListener('storage', handleStorage))

const queryType = computed(() => props.queryType)
const results = computed(() => props.results)

const currentView = computed(() => {
  if (queryType.value === 'SELECT') return queryStore.currentSelectView
  if (queryType.value === 'CONSTRUCT' || queryType.value === 'DESCRIBE')
    return queryStore.currentConstructView
  if (queryType.value === 'ASK') return queryStore.currentAskView
  return null
})

const isConstruct = computed(() => {
  return queryType.value === 'CONSTRUCT' || queryType.value === 'DESCRIBE'
})

/**
 * The current view narrowed to an RDF serialization format, or null when the
 * active CONSTRUCT/DESCRIBE view is the entity table rather than a serialization.
 */
const constructSerializationFormat = computed<'turtle' | 'ntriples' | 'nquads' | 'jsonld' | null>(
  () => {
    const view = currentView.value
    if (view === 'turtle' || view === 'ntriples' || view === 'nquads' || view === 'jsonld') {
      return view
    }
    return null
  }
)
</script>

<style scoped>
.results-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.query-type-badge {
  padding: 0.5rem 1rem;
  background: var(--color-primary);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
}

.view-toolbar {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.view-button {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.view-button:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.view-button.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.view-button svg {
  width: 16px;
  height: 16px;
}

.view-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>
