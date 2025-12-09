<template>
  <div class="select-table-view">
    <div class="table-container">
      <table class="results-table">
        <thead>
          <tr>
            <th v-for="variable in columns" :key="variable">{{ variable }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td v-for="variable in columns" :key="variable">
              <CellValue
                v-if="row[variable]"
                :value="row[variable].value"
                :type="row[variable].type"
                :datatype="row[variable].datatype"
                :language="row[variable]['xml:lang']"
              />
              <span v-else class="empty">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>{{ rows.length }} row{{ rows.length !== 1 ? 's' : '' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CellValue from './CellValue.vue'

const props = defineProps<{
  results: {
    head: {
      vars: string[]
    }
    results: {
      bindings: Record<string, any>[]
    }
  }
}>()

const columns = computed(() => props.results.head.vars)
const rows = computed(() => props.results.results.bindings)
</script>

<style scoped>
.select-table-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.table-container {
  flex: 1;
  overflow: auto;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.results-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-bg-header);
}

.results-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 2px solid var(--color-border);
  white-space: nowrap;
}

.results-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}

.results-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.results-table tbody tr:nth-child(even) {
  background: rgba(0, 0, 0, 0.02);
}

.results-table tbody tr:nth-child(even):hover {
  background: var(--color-bg-hover);
}

.table-footer {
  padding: 0.75rem 1rem;
  background: var(--color-bg-header);
  border-top: 1px solid var(--color-border);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-align: right;
}

.empty {
  color: var(--color-text-secondary);
  font-style: italic;
}
</style>
