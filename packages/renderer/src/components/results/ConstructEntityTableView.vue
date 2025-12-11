<template>
  <div class="construct-entity-table-view">
    <div v-if="isLoading" class="loading">
      <span>Parsing RDF data...</span>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>
    <div v-else-if="entities.length > 0" class="content-wrapper">
      <div class="metrics-header">
        <div class="metrics">
          <div class="metric">
            <span class="metric-value">{{ entities.length }}</span>
            <span class="metric-label">entit{{ entities.length !== 1 ? 'ies' : 'y' }}</span>
          </div>
          <div class="metric">
            <span class="metric-value">{{ totalTriples }}</span>
            <span class="metric-label">statement{{ totalTriples !== 1 ? 's' : '' }}</span>
          </div>
        </div>
        <div class="collapse-controls">
          <button @click="expandAll" class="control-button" title="Expand all entities">
            Expand All
          </button>
          <button @click="collapseAll" class="control-button" title="Collapse all entities">
            Collapse All
          </button>
        </div>
      </div>
      <div class="entities-container">
      <div v-for="(entity, index) in entities" :key="index" class="entity-card">
        <div class="entity-header" @click="toggleEntity(index)">
          <button class="collapse-button" :class="{ collapsed: collapsedEntities.has(index) }">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 11L3 6h10l-5 5z" />
            </svg>
          </button>
          <CellValue :value="entity.subject" :type="entity.subjectType" class="entity-subject" />
          <span class="triple-count"
            >{{ entity.triples.length }} triple{{ entity.triples.length !== 1 ? 's' : '' }}</span
          >
        </div>
        <table v-show="!collapsedEntities.has(index)" class="entity-table">
          <tbody>
            <tr v-for="(triple, tIndex) in entity.triples" :key="tIndex">
              <td class="predicate-cell">
                <CellValue :value="triple.predicate" type="uri" />
              </td>
              <td class="object-cell">
                <CellValue
                  :value="triple.object"
                  :type="triple.objectType"
                  :datatype="triple.datatype"
                  :language="triple.language"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
    <div v-else class="empty">No RDF triples found</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { rdfProcessor, type EntityGroup } from '@/services/rdf/rdfProcessor'
import CellValue from './CellValue.vue'

const props = defineProps<{
  turtleData: string
}>()

const isLoading = ref(false)
const entities = ref<EntityGroup[]>([])
const error = ref<string | null>(null)
const collapsedEntities = ref<Set<number>>(new Set())

const totalTriples = computed(() => {
  return entities.value.reduce((sum, entity) => sum + entity.triples.length, 0)
})

function toggleEntity(index: number) {
  if (collapsedEntities.value.has(index)) {
    collapsedEntities.value.delete(index)
  } else {
    collapsedEntities.value.add(index)
  }
  // Trigger reactivity by creating a new Set
  collapsedEntities.value = new Set(collapsedEntities.value)
}

function collapseAll() {
  collapsedEntities.value = new Set(entities.value.map((_, index) => index))
}

function expandAll() {
  collapsedEntities.value = new Set()
}

async function parseAndGroup() {
  if (!props.turtleData) {
    entities.value = []
    error.value = null
    return
  }

  isLoading.value = true
  error.value = null
  entities.value = []

  try {
    // Parse Turtle data
    const dataset = await rdfProcessor.parseTurtle(props.turtleData)

    // Group by entity
    entities.value = rdfProcessor.groupByEntity(dataset)
  } catch (err: any) {
    error.value = `Failed to parse RDF data: ${err.message}`
    console.error('RDF parsing error:', err)
  } finally {
    isLoading.value = false
  }
}

// Parse when component mounts or when data changes
onMounted(() => parseAndGroup())
watch(() => props.turtleData, parseAndGroup)
</script>

<style scoped>
.construct-entity-table-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.loading,
.error,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
  padding: 2rem;
  text-align: center;
}

.error {
  color: var(--color-error);
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.metrics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.metrics {
  display: flex;
  gap: 2rem;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 0.125rem;
}

.collapse-controls {
  display: flex;
  gap: 0.5rem;
}

.control-button {
  padding: 0.5rem 0.875rem;
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.control-button:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-text-secondary);
}

.entities-container {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.entity-card {
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.entity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.entity-header:hover {
  background: var(--color-bg-hover);
}

.collapse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 0.5rem;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    transform 0.2s,
    color 0.2s;
  flex-shrink: 0;
}

.collapse-button.collapsed {
  transform: rotate(-90deg);
}

.collapse-button:hover {
  color: var(--color-text-primary);
}

.entity-subject {
  flex: 1;
  font-size: 0.95rem;
}

.triple-count {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-main);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  margin-left: 1rem;
}

.entity-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.entity-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.entity-table tr:last-child td {
  border-bottom: none;
}

.predicate-cell {
  width: 40%;
  font-weight: 500;
}

.object-cell {
  width: 60%;
}

.entity-table tr:hover {
  background: var(--color-bg-hover);
}
</style>
