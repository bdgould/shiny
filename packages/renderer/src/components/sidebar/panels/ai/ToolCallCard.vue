<template>
  <div class="tool-call-card" :class="[`status-${toolCall.status}`]">
    <div class="tool-header" @click="toggleExpanded">
      <div class="tool-info">
        <span class="tool-icon">{{ toolIcon }}</span>
        <span class="tool-name">{{ toolDisplayName }}</span>
        <span class="status-badge" :class="[`badge-${toolCall.status}`]">
          {{ statusLabel }}
        </span>
      </div>
      <button class="expand-toggle" :aria-label="expanded ? 'Collapse' : 'Expand'">
        {{ expanded ? '−' : '+' }}
      </button>
    </div>

    <div v-if="expanded" class="tool-body">
      <!-- Target backend display for backend-related tools -->
      <div v-if="targetBackend && usesBackend" class="target-backend">
        <span class="backend-label">Target:</span>
        <span class="backend-name">{{ targetBackend.name }}</span>
        <span class="backend-type">({{ targetBackend.type }})</span>
        <span class="backend-id">ID: {{ targetBackendId }}</span>
      </div>
      <div v-else-if="usesBackend && !targetBackend" class="target-backend warning">
        <span class="backend-label">Warning:</span>
        <span class="backend-name">No backend selected for current tab</span>
        <span class="backend-id">Tab backendId: {{ targetBackendId || 'null' }}</span>
      </div>

      <div class="tool-section">
        <div class="section-label">Input</div>
        <pre class="json-display">{{ formattedArguments }}</pre>
      </div>

      <div v-if="toolCall.result !== undefined" class="tool-section">
        <div class="section-label">Output</div>
        <pre class="json-display">{{ formattedResult }}</pre>
      </div>

      <div v-if="toolCall.error" class="tool-section">
        <div class="section-label error-label">Error</div>
        <pre class="json-display error-display">{{ toolCall.error }}</pre>
      </div>

      <div v-if="toolCall.status === 'pending'" class="tool-actions">
        <button
          class="action-btn approve-btn"
          :disabled="usesBackend && !targetBackend"
          @click="$emit('approve')"
        >
          Approve
        </button>
        <button class="action-btn reject-btn" @click="$emit('reject')">
          Reject
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolCall } from '@/types/aiChat'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionStore } from '@/stores/connection'

const props = defineProps<{
  toolCall: ToolCall
}>()

defineEmits<{
  approve: []
  reject: []
}>()

const tabsStore = useTabsStore()
const connectionStore = useConnectionStore()

const expanded = ref(props.toolCall.status === 'pending')

// Tools that require a backend connection
const backendTools = new Set(['searchOntology', 'getClassDetails', 'getPropertyDetails', 'runSparqlQuery'])

const usesBackend = computed(() => backendTools.has(props.toolCall.name))

const targetBackendId = computed(() => {
  return tabsStore.activeTab?.backendId || null
})

const targetBackend = computed(() => {
  const backendId = targetBackendId.value
  if (!backendId) return null
  return connectionStore.backends.find((b) => b.id === backendId) || null
})

const toolDisplayName = computed(() => {
  const names: Record<string, string> = {
    searchOntology: 'Search Ontology',
    listOntologyElements: 'List Ontology Elements',
    getClassDetails: 'Get Class Details',
    getPropertyDetails: 'Get Property Details',
    runSparqlQuery: 'Run SPARQL Query'
  }
  return names[props.toolCall.name] || props.toolCall.name
})

const toolIcon = computed(() => {
  const icons: Record<string, string> = {
    searchOntology: '🔍',
    listOntologyElements: '📋',
    getClassDetails: '📦',
    getPropertyDetails: '🔗',
    runSparqlQuery: '▶'
  }
  return icons[props.toolCall.name] || '⚙'
})

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    pending: 'Awaiting Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    executing: 'Executing...',
    completed: 'Completed',
    error: 'Error'
  }
  return labels[props.toolCall.status] || props.toolCall.status
})

const formattedArguments = computed(() => {
  return JSON.stringify(props.toolCall.arguments, null, 2)
})

const formattedResult = computed(() => {
  return JSON.stringify(props.toolCall.result, null, 2)
})

function toggleExpanded() {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.tool-call-card {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin: 8px 0;
  overflow: hidden;
  background: var(--color-background-secondary);
}

.tool-call-card.status-pending {
  border-color: var(--color-warning, #f59e0b);
}

.tool-call-card.status-error {
  border-color: var(--color-error, #ef4444);
}

.tool-call-card.status-completed {
  border-color: var(--color-success, #22c55e);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--color-background-tertiary);
}

.tool-header:hover {
  background: var(--color-bg-hover);
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  font-size: 14px;
}

.tool-name {
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text-primary);
}

.status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-pending {
  background: rgba(245, 158, 11, 0.2);
  color: var(--color-warning, #f59e0b);
}

.badge-approved,
.badge-executing {
  background: rgba(59, 130, 246, 0.2);
  color: var(--color-accent, #3b82f6);
}

.badge-completed {
  background: rgba(34, 197, 94, 0.2);
  color: var(--color-success, #22c55e);
}

.badge-rejected,
.badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: var(--color-error, #ef4444);
}

.expand-toggle {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 16px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.expand-toggle:hover {
  background: var(--color-bg-hover);
}

.tool-body {
  padding: 12px;
  border-top: 1px solid var(--color-border);
}

.target-backend {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  font-size: 12px;
}

.target-backend.warning {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}

.backend-label {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.backend-name {
  color: var(--color-text-primary);
  font-weight: 600;
}

.backend-type {
  color: var(--color-text-secondary);
}

.backend-id {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-family: var(--font-mono, monospace);
  margin-left: auto;
}

.target-backend.warning .backend-name {
  color: var(--color-warning, #f59e0b);
}

.tool-section {
  margin-bottom: 12px;
}

.tool-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.error-label {
  color: var(--color-error, #ef4444);
}

.json-display {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  background: var(--color-background);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  color: var(--color-text-primary);
}

.error-display {
  color: var(--color-error, #ef4444);
}

.tool-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.action-btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.15s;
}

.approve-btn {
  background: var(--color-success, #22c55e);
  color: white;
}

.approve-btn:hover:not(:disabled) {
  background: #16a34a;
}

.approve-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reject-btn {
  background: var(--color-background-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.reject-btn:hover {
  background: var(--color-bg-hover);
}
</style>
