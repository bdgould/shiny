<template>
  <div class="json-view">
    <pre>{{ formattedData }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: any
}>()

const formattedData = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2)
  } catch (error) {
    return String(props.data)
  }
})
</script>

<style scoped>
.json-view {
  height: 100%;
  overflow: auto;
  padding: 1rem;
}

.json-view pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
