<template>
  <div class="chat-header">
    <div class="header-left">
      <h2 class="header-title">AI Assistant</h2>
      <span class="status-dot" :class="{ configured: isConfigured }" :title="statusTitle"></span>
    </div>
    <div class="header-right">
      <button
        v-if="hasMessages"
        class="clear-button"
        title="Clear conversation"
        @click="$emit('clear')"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="3 6 5 6 21 6"></polyline>
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          ></path>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isConfigured: boolean
  hasMessages: boolean
}>()

defineEmits<{
  clear: []
}>()

const statusTitle = computed(() => {
  return props.isConfigured ? 'API configured' : 'API not configured - click to configure'
})
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error, #ef4444);
}

.status-dot.configured {
  background: var(--color-success, #22c55e);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.clear-button:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
</style>
