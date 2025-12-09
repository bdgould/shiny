<template>
  <span class="cell-value">
    <a
      v-if="type === 'uri'"
      :href="value"
      target="_blank"
      rel="noopener noreferrer"
      class="uri-link"
      :title="value"
    >
      {{ displayValue }}
    </a>
    <span v-else-if="type === 'literal'" class="literal">
      {{ value }}
      <span v-if="language" class="annotation">@{{ language }}</span>
      <span v-else-if="datatype && !isDefaultDatatype" class="annotation" :title="datatype">
        ^^{{ shortenURI(datatype) }}
      </span>
    </span>
    <span v-else-if="type === 'bnode'" class="bnode">_:{{ value }}</span>
    <span v-else-if="!value || value === ''" class="empty">-</span>
    <span v-else class="unknown">{{ value }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { shortenURI, isURI } from '@/utils/uriShortener'

const props = defineProps<{
  value: string
  type: 'uri' | 'literal' | 'bnode' | string
  datatype?: string
  language?: string
}>()

const displayValue = computed(() => {
  if (props.type === 'uri' && isURI(props.value)) {
    return shortenURI(props.value)
  }
  return props.value
})

const isDefaultDatatype = computed(() => {
  return (
    props.datatype === 'http://www.w3.org/2001/XMLSchema#string' ||
    props.datatype === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'
  )
})
</script>

<style scoped>
.cell-value {
  display: inline-block;
  word-break: break-word;
}

.uri-link {
  color: var(--color-primary);
  text-decoration: none;
  transition: color 0.2s;
}

.uri-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.literal {
  color: var(--color-text-primary);
}

.annotation {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-left: 0.25rem;
}

.bnode {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  font-style: italic;
  color: var(--color-text-secondary);
}

.empty {
  color: var(--color-text-secondary);
  font-style: italic;
}

.unknown {
  color: var(--color-text-primary);
}
</style>
