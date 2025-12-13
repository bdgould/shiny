<template>
  <div class="backend-item">
    <div class="backend-header">
      <div class="backend-info">
        <h3 class="backend-name">{{ backend.name }}</h3>
        <p class="backend-type">{{ backendTypeLabel }}</p>
      </div>
      <div class="backend-actions">
        <button
          class="btn-icon"
          title="Test connection"
          :disabled="isTesting"
          @click="$emit('test')"
        >
          <span v-if="isTesting" class="spinner"></span>
          <span v-else>🔌</span>
        </button>
        <button class="btn-icon" title="Edit" @click="$emit('edit')">✏️</button>
        <button class="btn-icon btn-danger" title="Delete" @click="$emit('delete')">🗑️</button>
      </div>
    </div>

    <div class="backend-details">
      <div class="detail-row">
        <span class="detail-label">Endpoint:</span>
        <span class="detail-value">{{ backend.endpoint }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Auth:</span>
        <span class="detail-value">{{ authTypeLabel }}</span>
      </div>
    </div>

    <Transition name="fade-slide">
      <div v-if="testResult" class="test-result" :class="testResult.valid ? 'success' : 'error'">
        {{ testResult.valid ? '✓ Connection successful' : `✗ ${testResult.error}` }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BackendConfig } from '@/types/backends'
import { BACKEND_TYPE_LABELS, AUTH_TYPE_LABELS } from '@/types/backends'

interface Props {
  backend: BackendConfig
  isTesting?: boolean
  testResult?: { valid: boolean; error?: string } | null
}

const props = withDefaults(defineProps<Props>(), {
  isTesting: false,
  testResult: null,
})

defineEmits<{
  test: []
  edit: []
  delete: []
}>()

const backendTypeLabel = computed(() => {
  return (
    BACKEND_TYPE_LABELS[props.backend.type as keyof typeof BACKEND_TYPE_LABELS] ||
    props.backend.type
  )
})

const authTypeLabel = computed(() => {
  return (
    AUTH_TYPE_LABELS[props.backend.authType as keyof typeof AUTH_TYPE_LABELS] ||
    props.backend.authType
  )
})
</script>

<style scoped>
.backend-item {
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  transition: all 0.15s ease;
}

.backend-item:hover {
  border-color: var(--color-primary-alpha);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.backend-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.backend-info {
  flex: 1;
  min-width: 0;
}

.backend-name {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backend-type {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.backend-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}

.btn-icon:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon.btn-danger:hover:not(:disabled) {
  background: var(--color-error);
  border-color: var(--color-error);
  color: white;
}

.backend-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.detail-label {
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: 60px;
}

.detail-value {
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.test-result {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.test-result.success {
  background: rgba(56, 142, 60, 0.1);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

.test-result.error {
  background: rgba(211, 47, 47, 0.1);
  color: var(--color-error);
  border: 1px solid var(--color-error);
}

/* Smooth fade and slide-down transition for test results */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Spinner animation for test button */
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
