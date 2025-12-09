<template>
  <Teleport to="body">
    <div v-if="isOpen" class="dialog-overlay" @click="handleOverlayClick">
      <div class="dialog" @click.stop>
        <div class="dialog-header">
          <h3>Select Export Format</h3>
          <button class="btn-close" @click="close" aria-label="Close dialog">×</button>
        </div>
        <div class="dialog-content">
          <div class="format-options">
            <button
              v-for="format in formats"
              :key="format.value"
              @click="selectFormat(format.value)"
              class="format-option"
            >
              <span class="format-label">{{ format.label }}</span>
              <span class="format-extension">.{{ getExtension(format.value) }}</span>
            </button>
          </div>
        </div>
        <div class="dialog-footer">
          <button @click="close" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface Format {
  value: string;
  label: string;
}

interface Props {
  formats: Format[];
}

interface Emits {
  (e: 'select', format: string): void;
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isOpen = ref(false);

function open() {
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
  emit('close');
}

function selectFormat(format: string) {
  emit('select', format);
  close();
}

function handleOverlayClick() {
  close();
}

function getExtension(format: string): string {
  const extensionMap: Record<string, string> = {
    'csv': 'csv',
    'json': 'json',
    'turtle': 'ttl',
    'trig': 'trig',
    'ntriples': 'nt',
    'nquads': 'nq',
    'jsonld': 'jsonld',
  };
  return extensionMap[format] || format;
}

defineExpose({
  open,
  close,
});
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-header);
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.format-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.format-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1rem;
  background: var(--color-bg-header);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.format-option:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.format-option:active {
  transform: translateY(0);
}

.format-label {
  font-weight: 500;
}

.format-extension {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-main);
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-header);
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: var(--color-bg-main);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-text-secondary);
}
</style>
