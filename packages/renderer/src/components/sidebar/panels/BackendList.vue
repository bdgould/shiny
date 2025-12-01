<template>
  <div class="backend-list">
    <div class="list-header">
      <h2>Backends</h2>
      <button class="btn-primary btn-sm" @click="$emit('add')">
        + Add Backend
      </button>
    </div>

    <div v-if="connectionStore.isLoading" class="loading-state">
      Loading backends...
    </div>

    <div v-else-if="connectionStore.error" class="error-state">
      <p>{{ connectionStore.error }}</p>
      <button class="btn-secondary btn-sm" @click="connectionStore.loadBackends()">
        Retry
      </button>
    </div>

    <div v-else-if="!connectionStore.hasBackends" class="empty-state">
      <p>No backends configured</p>
      <p class="empty-hint">Click "Add Backend" to create your first connection</p>
    </div>

    <div v-else class="backend-items">
      <BackendListItem
        v-for="backend in connectionStore.backends"
        :key="backend.id"
        :backend="backend"
        :is-selected="backend.id === connectionStore.selectedBackendId"
        :is-testing="testingBackendId === backend.id"
        :test-result="testResults[backend.id]"
        @test="handleTest(backend.id)"
        @edit="$emit('edit', backend)"
        @delete="handleDelete(backend.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useConnectionStore } from '@/stores/connection';
import BackendListItem from './BackendListItem.vue';
import type { BackendConfig } from '@/types/backends';

const connectionStore = useConnectionStore();

defineEmits<{
  add: [];
  edit: [backend: BackendConfig];
}>();

// Test connection state
const testingBackendId = ref<string | null>(null);
const testResults = ref<Record<string, { valid: boolean; error?: string }>>({});

async function handleTest(backendId: string) {
  testingBackendId.value = backendId;
  testResults.value[backendId] = { valid: false, error: 'Testing...' };

  try {
    const result = await connectionStore.testConnection(backendId);
    testResults.value[backendId] = result;

    // Clear result after 5 seconds
    setTimeout(() => {
      if (testResults.value[backendId]) {
        delete testResults.value[backendId];
      }
    }, 5000);
  } catch (error) {
    testResults.value[backendId] = {
      valid: false,
      error: error instanceof Error ? error.message : 'Test failed',
    };
  } finally {
    testingBackendId.value = null;
  }
}

async function handleDelete(backendId: string) {
  if (!confirm('Are you sure you want to delete this backend?')) {
    return;
  }

  try {
    await connectionStore.deleteBackend(backendId);
  } catch (error) {
    console.error('Failed to delete backend:', error);
    alert(error instanceof Error ? error.message : 'Failed to delete backend');
  }
}
</script>

<style scoped>
.backend-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.list-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  font-weight: 500;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.backend-items {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.loading-state,
.error-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-secondary);
}

.empty-state p {
  margin: 0 0 8px 0;
  font-size: 14px;
}

.empty-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.8;
}

.error-state {
  color: var(--color-error);
}

.error-state p {
  margin: 0 0 12px 0;
}
</style>
