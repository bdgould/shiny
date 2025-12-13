<template>
  <div class="rdf-serialization-view">
    <div v-if="isLoading" class="loading">
      <span>Converting to {{ formatLabel }}...</span>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>
    <div v-else-if="serializedData" class="serialization-container">
      <div class="code-with-lines">
        <div class="line-numbers">
          <div v-for="lineNum in lineCount" :key="lineNum" class="line-number">{{ lineNum }}</div>
        </div>
        <pre class="code-content">{{ serializedData }}</pre>
      </div>
    </div>
    <div v-else class="empty">No data to display</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { rdfProcessor } from '@/services/rdf/rdfProcessor'

const props = defineProps<{
  turtleData: string
  format: 'turtle' | 'ntriples' | 'nquads' | 'jsonld'
}>()

const isLoading = ref(false)
const serializedData = ref<string | null>(null)
const error = ref<string | null>(null)

const formatLabel = computed(() => {
  const labels = {
    turtle: 'Turtle',
    ntriples: 'N-Triples',
    nquads: 'N-Quads',
    jsonld: 'JSON-LD',
  }
  return labels[props.format]
})

const lineCount = computed(() => {
  if (!serializedData.value) return 0
  return serializedData.value.split('\n').length
})

async function serialize() {
  if (!props.turtleData) {
    serializedData.value = null
    error.value = null
    return
  }

  isLoading.value = true
  error.value = null
  serializedData.value = null

  try {
    // If the requested format is Turtle, just use the original data
    // This avoids unnecessary parse/serialize round-trip and potential issues
    if (props.format === 'turtle') {
      serializedData.value = props.turtleData
      isLoading.value = false
      return
    }

    // Parse Turtle data for other formats
    const dataset = await rdfProcessor.parseTurtle(props.turtleData)

    // Serialize to requested format
    let result: string
    switch (props.format) {
      case 'ntriples':
        result = await rdfProcessor.serializeToNTriples(dataset)
        break
      case 'nquads':
        result = await rdfProcessor.serializeToNQuads(dataset)
        break
      case 'jsonld':
        result = await rdfProcessor.serializeToJsonLD(dataset)
        break
      default:
        throw new Error(`Unsupported format: ${props.format}`)
    }

    serializedData.value = result
  } catch (err: any) {
    error.value = `Failed to serialize RDF data: ${err.message}`
    console.error('RDF serialization error:', err)
  } finally {
    isLoading.value = false
  }
}

// Serialize when component mounts or when inputs change
onMounted(() => serialize())
watch(() => [props.turtleData, props.format], serialize)
</script>

<style scoped>
.rdf-serialization-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.loading,
.error,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  padding: 2rem;
  text-align: center;
}

.error {
  color: var(--color-error);
}

.serialization-container {
  flex: 1;
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
