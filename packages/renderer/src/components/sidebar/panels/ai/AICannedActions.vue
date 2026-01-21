<template>
  <div class="canned-actions">
    <button
      v-for="action in actions"
      :key="action.label"
      class="action-button"
      :disabled="disabled"
      @click="$emit('action', action.prompt)"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { QuickAction } from '@/types/aiChat'

defineProps<{
  disabled?: boolean
}>()

defineEmits<{
  action: [prompt: string]
}>()

const actions: QuickAction[] = [
  {
    label: 'Explain Query',
    prompt: 'Please explain what this SPARQL query does step by step.'
  },
  {
    label: 'Optimize Query',
    prompt: 'Can you suggest optimizations for this query to improve performance?'
  },
  {
    label: 'Find Errors',
    prompt: 'Please review this query for potential errors or issues.'
  },
  {
    label: 'Fix Syntax',
    prompt: 'Check this query for syntax errors and suggest fixes.'
  }
]
</script>

<style scoped>
.canned-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
}

.action-button {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.action-button:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-accent, #3b82f6);
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
