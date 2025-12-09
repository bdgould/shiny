<template>
  <div class="ask-badge-view">
    <div :class="['ask-badge', result ? 'success' : 'error']">
      <CheckIcon v-if="result" class="badge-icon" />
      <XIcon v-else class="badge-icon" />
      <span class="badge-text">{{ result ? 'YES' : 'NO' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CheckIcon from './icons/CheckIcon.vue'
import XIcon from './icons/XIcon.vue'

const props = defineProps<{
  result: {
    head: any
    boolean: boolean
  }
}>()

// Extract boolean value
const result = computed(() => props.result.boolean)
</script>

<style scoped>
.ask-badge-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
}

.ask-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 4rem;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.ask-badge.success {
  background: #22c55e;
  color: white;
}

.ask-badge.error {
  background: #ef4444;
  color: white;
}

.badge-icon {
  width: 64px;
  height: 64px;
  opacity: 0.95;
}

.badge-text {
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>
