<template>
  <div class="json-view">
    <div class="code-with-lines">
      <div class="line-numbers">
        <div v-for="lineNum in lineCount" :key="lineNum" class="line-number">{{ lineNum }}</div>
      </div>
      <pre class="code-content">{{ formattedData }}</pre>
    </div>
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

const lineCount = computed(() => {
  return formattedData.value.split('\n').length
})
</script>

<style scoped>
.json-view {
  height: 100%;
  overflow: auto;
  padding: 1rem;
}

.code-with-lines {
  display: flex;
  gap: 1rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
}

.line-numbers {
  flex-shrink: 0;
  user-select: none;
  text-align: right;
  color: var(--color-text-secondary);
  padding-right: 1rem;
  border-right: 1px solid var(--color-border);
}

.line-number {
  line-height: 1.6;
  min-width: 2.5rem;
}

.code-content {
  flex: 1;
  margin: 0;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
