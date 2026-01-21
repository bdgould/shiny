<template>
  <div class="settings-view">
    <div class="settings-header">
      <h2>Ontology Cache Settings</h2>
      <p class="settings-description">
        Configure ontology element caching for backends. Cache classes, properties, and individuals
        for autocomplete and AI context enrichment.
      </p>
    </div>

    <div class="settings-content">
      <!-- Global Settings (Collapsible) -->
      <div class="collapsible-section">
        <button class="section-header" @click="toggleSection('global')">
          <span class="expand-icon">{{ expandedSections.global ? '▼' : '▶' }}</span>
          <h3>Global Settings</h3>
        </button>
        <div v-show="expandedSections.global" class="section-content">
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="globalSettings.enableAutocomplete" />
              <span>Enable autocomplete from cache</span>
            </label>
            <span class="help-text"
              >Show cached ontology elements in SPARQL editor autocomplete</span
            >
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="globalSettings.autoRefresh" />
              <span>Auto-refresh stale caches</span>
            </label>
            <span class="help-text">Automatically refresh expired caches in the background</span>
          </div>

          <div v-if="globalSettings.autoRefresh" class="form-group">
            <label for="refresh-interval">Refresh check interval</label>
            <div class="input-with-unit">
              <input
                id="refresh-interval"
                v-model.number="refreshIntervalMinutes"
                type="number"
                min="1"
                max="60"
                step="1"
              />
              <span class="unit">minutes</span>
            </div>
            <span class="help-text">How often to check for stale caches (1-60 minutes)</span>
          </div>
        </div>
      </div>

      <!-- Backend Selection (Always visible) -->
      <div class="settings-section">
        <div class="form-group">
          <label for="backend-select">Select Backend</label>
          <select id="backend-select" v-model="selectedBackendId" @change="onBackendChange">
            <option value="">-- Select a backend --</option>
            <option v-for="backend in backends" :key="backend.id" :value="backend.id">
              {{ backend.name }} ({{ backend.type }})
            </option>
          </select>
          <span class="help-text">Choose a backend to configure caching</span>
        </div>
      </div>

      <template v-if="selectedBackend">
        <!-- Backend Configuration (Collapsible) -->
        <div class="collapsible-section">
          <button class="section-header" @click="toggleSection('config')">
            <span class="expand-icon">{{ expandedSections.config ? '▼' : '▶' }}</span>
            <h3>Backend Configuration</h3>
          </button>
          <div v-show="expandedSections.config" class="section-content">
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="cacheEnabled" @change="onCacheEnabledChange" />
                <span>Enable caching for this backend</span>
              </label>
              <span class="help-text">When enabled, ontology elements will be cached locally</span>
            </div>

            <template v-if="cacheEnabled">
              <div class="form-group">
                <label for="cache-ttl">Cache TTL (Time to Live)</label>
                <div class="input-with-unit">
                  <input
                    id="cache-ttl"
                    v-model.number="ttlHours"
                    type="number"
                    min="1"
                    max="168"
                    step="1"
                  />
                  <span class="unit">hours</span>
                </div>
                <span class="help-text">How long the cache remains valid (1-168 hours)</span>
              </div>

              <div class="form-group">
                <label for="max-elements">Maximum Elements</label>
                <input
                  id="max-elements"
                  v-model.number="maxElements"
                  type="number"
                  min="1000"
                  max="100000"
                  step="1000"
                />
                <span class="help-text">Safety limit for cached elements (1,000-100,000)</span>
              </div>

              <!-- Cache Status -->
              <div class="cache-status">
                <h4>Cache Status</h4>
                <div v-if="cacheStats" class="status-grid">
                  <div class="status-item">
                    <span class="status-label">Classes:</span>
                    <span class="status-value">{{ cacheStats.classCount }}</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Properties:</span>
                    <span class="status-value">{{ cacheStats.propertyCount }}</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Individuals:</span>
                    <span class="status-value">{{ cacheStats.individualCount }}</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Last Updated:</span>
                    <span class="status-value">{{
                      formatTimestamp(cacheMetadata?.lastUpdated)
                    }}</span>
                  </div>
                </div>
                <div v-else class="no-cache-message">
                  No cache data yet. Click "Refresh Cache Now" to fetch ontology elements.
                </div>
                <div class="cache-actions">
                  <button
                    class="btn-secondary btn-small"
                    @click="refreshCache"
                    :disabled="isRefreshing"
                  >
                    {{ isRefreshing ? 'Refreshing...' : 'Refresh Cache Now' }}
                  </button>
                  <button v-if="cacheStats" class="btn-secondary btn-small" @click="clearCache">
                    Clear Cache
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- SPARQL Queries (Collapsible) -->
        <div v-if="cacheEnabled" class="collapsible-section">
          <button class="section-header" @click="toggleSection('queries')">
            <span class="expand-icon">{{ expandedSections.queries ? '▼' : '▶' }}</span>
            <h3>SPARQL Queries</h3>
          </button>
          <div v-show="expandedSections.queries" class="section-content">
            <p class="section-description">
              Customize the SPARQL queries used to fetch ontology elements. Use Dublin Core
              (dc:title, dc:description) and RDFS (rdfs:label, rdfs:comment) predicates.
            </p>

            <!-- Classes Query -->
            <div class="query-group">
              <div class="query-header">
                <h4>Classes Query</h4>
                <div class="query-actions">
                  <button
                    class="btn-link btn-small"
                    @click="testQuery('classes')"
                    :disabled="isTestingQuery"
                  >
                    {{ isTestingQuery ? 'Testing...' : 'Test Query' }}
                  </button>
                  <button class="btn-link btn-small" @click="resetQuery('classes')">
                    Reset to Default
                  </button>
                </div>
              </div>
              <textarea
                v-model="classesQuery"
                class="query-textarea"
                rows="10"
                spellcheck="false"
              ></textarea>
              <div
                v-if="testResults.classes"
                class="test-result"
                :class="testResults.classes.valid ? 'success' : 'error'"
              >
                {{
                  testResults.classes.valid
                    ? `✓ Valid (${testResults.classes.resultCount} results)`
                    : `✗ ${testResults.classes.error}`
                }}
              </div>
            </div>

            <!-- Properties Query -->
            <div class="query-group">
              <div class="query-header">
                <h4>Properties Query</h4>
                <div class="query-actions">
                  <button
                    class="btn-link btn-small"
                    @click="testQuery('properties')"
                    :disabled="isTestingQuery"
                  >
                    {{ isTestingQuery ? 'Testing...' : 'Test Query' }}
                  </button>
                  <button class="btn-link btn-small" @click="resetQuery('properties')">
                    Reset to Default
                  </button>
                </div>
              </div>
              <textarea
                v-model="propertiesQuery"
                class="query-textarea"
                rows="10"
                spellcheck="false"
              ></textarea>
              <div
                v-if="testResults.properties"
                class="test-result"
                :class="testResults.properties.valid ? 'success' : 'error'"
              >
                {{
                  testResults.properties.valid
                    ? `✓ Valid (${testResults.properties.resultCount} results)`
                    : `✗ ${testResults.properties.error}`
                }}
              </div>
            </div>

            <!-- Individuals Query -->
            <div class="query-group">
              <div class="query-header">
                <h4>Individuals Query</h4>
                <div class="query-actions">
                  <button
                    class="btn-link btn-small"
                    @click="testQuery('individuals')"
                    :disabled="isTestingQuery"
                  >
                    {{ isTestingQuery ? 'Testing...' : 'Test Query' }}
                  </button>
                  <button class="btn-link btn-small" @click="resetQuery('individuals')">
                    Reset to Default
                  </button>
                </div>
              </div>
              <textarea
                v-model="individualsQuery"
                class="query-textarea"
                rows="10"
                spellcheck="false"
              ></textarea>
              <div
                v-if="testResults.individuals"
                class="test-result"
                :class="testResults.individuals.valid ? 'success' : 'error'"
              >
                {{
                  testResults.individuals.valid
                    ? `✓ Valid (${testResults.individuals.resultCount} results)`
                    : `✗ ${testResults.individuals.error}`
                }}
              </div>
            </div>
          </div>
        </div>

        <!-- Ontology Element Browser (Collapsible) -->
        <div v-if="cacheEnabled && cacheStats" class="collapsible-section">
          <button class="section-header" @click="toggleSection('browser')">
            <span class="expand-icon">{{ expandedSections.browser ? '▼' : '▶' }}</span>
            <h3>Cached Elements Browser</h3>
            <span class="element-count">({{ cacheStats.totalCount }} total)</span>
          </button>
          <div v-show="expandedSections.browser" class="section-content">
            <p class="section-description">Click any element to copy its IRI to the clipboard.</p>

            <!-- Browser Controls -->
            <div class="browser-controls">
              <div class="search-box">
                <input
                  v-model="browserSearch"
                  type="text"
                  placeholder="Search elements by IRI, label, or description..."
                  class="search-input"
                  @input="onBrowserSearchChange"
                />
              </div>
              <div class="filter-row">
                <div class="filter-buttons">
                  <button
                    v-for="type in elementTypes"
                    :key="type.value"
                    :class="['filter-btn', { active: browserFilter.includes(type.value) }]"
                    @click="toggleFilter(type.value)"
                  >
                    {{ type.icon }} {{ type.label }} ({{ getTypeCount(type.value) }})
                  </button>
                </div>
                <div
                  v-if="browserCopyMessage"
                  class="copy-notification"
                  :class="browserCopyMessageType"
                >
                  {{ browserCopyMessage }}
                </div>
              </div>
            </div>

            <!-- Browser Results -->
            <div class="browser-results">
              <div v-if="isBrowserLoading" class="browser-loading">Loading elements...</div>
              <div v-else-if="browserElements.length === 0" class="browser-empty">
                No elements found matching your search.
              </div>
              <div v-else class="element-list">
                <div
                  v-for="element in browserElements"
                  :key="element.iri"
                  class="element-item"
                  @click="selectElement(element)"
                >
                  <div class="element-header">
                    <span class="element-icon">{{ getElementIcon(element.type) }}</span>
                    <span class="element-label">{{
                      element.label || element.localName || 'Unnamed'
                    }}</span>
                    <span class="element-type">{{ element.type }}</span>
                  </div>
                  <div class="element-iri">{{ element.iri }}</div>
                  <div v-if="element.description" class="element-description">
                    {{ element.description }}
                  </div>
                  <div v-if="element.type === 'property'" class="element-meta">
                    <span v-if="(element as any).propertyType" class="meta-tag">
                      {{ (element as any).propertyType }}
                    </span>
                    <span v-if="(element as any).domain?.length" class="meta-tag">
                      domain: {{ (element as any).domain.length }}
                    </span>
                    <span v-if="(element as any).range?.length" class="meta-tag">
                      range: {{ (element as any).range.length }}
                    </span>
                  </div>
                  <div
                    v-if="element.type === 'individual' && (element as any).classes?.length"
                    class="element-meta"
                  >
                    <span class="meta-tag"> types: {{ (element as any).classes.length }} </span>
                  </div>
                </div>
              </div>

              <!-- Load More Button -->
              <div v-if="hasMoreElements" class="load-more">
                <button class="btn-secondary btn-small" @click="loadMoreElements">Load More</button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Save Actions -->
      <div class="settings-actions">
        <button class="btn-secondary" @click="resetToDefaults">Reset All to Defaults</button>
        <button class="btn-primary" @click="saveSettings">Save Settings</button>
      </div>

      <div v-if="saveMessage" class="save-message" :class="saveMessageType">
        {{ saveMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useOntologyCacheStore } from '@/stores/ontologyCache'
import {
  getCacheSettings,
  saveCacheSettings,
  type GlobalCacheSettings,
} from '@/services/preferences/appSettings'
import {
  DEFAULT_CACHE_CONFIG,
  type CacheConfig,
  type CacheStats,
  type CacheMetadata,
  type AnyOntologyElement,
  type OntologyElementType,
} from '@/types/ontologyCache'

const connectionStore = useConnectionStore()
const cacheStore = useOntologyCacheStore()

// State
const selectedBackendId = ref('')
const cacheEnabled = ref(false)
const ttlHours = ref(24)
const maxElements = ref(50000)
const classesQuery = ref('')
const propertiesQuery = ref('')
const individualsQuery = ref('')
const globalSettings = ref<GlobalCacheSettings>(getCacheSettings())
const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')
const isRefreshing = ref(false)
const isTestingQuery = ref(false)
const cacheStats = ref<CacheStats | null>(null)
const cacheMetadata = ref<CacheMetadata | null>(null)
const testResults = ref<Record<string, { valid: boolean; error?: string; resultCount?: number }>>(
  {}
)

// Collapsible sections state
const expandedSections = ref({
  config: true,
  queries: false,
  browser: false,
  global: false,
})

// Browser state
const browserSearch = ref('')
const browserFilter = ref<OntologyElementType[]>(['class', 'property', 'individual'])
const browserElements = ref<AnyOntologyElement[]>([])
const browserLimit = ref(50)
const isBrowserLoading = ref(false)
const browserCopyMessage = ref('')
const browserCopyMessageType = ref<'success' | 'error'>('success')

const elementTypes = [
  { value: 'class' as const, label: 'Classes', icon: '📦' },
  { value: 'property' as const, label: 'Properties', icon: '🔗' },
  { value: 'individual' as const, label: 'Individuals', icon: '🎯' },
]

// Computed
const backends = computed(() => connectionStore.backends)
const selectedBackend = computed(() => {
  if (!selectedBackendId.value) return null
  return backends.value.find((b) => b.id === selectedBackendId.value) || null
})

const refreshIntervalMinutes = computed({
  get: () => Math.round(globalSettings.value.refreshCheckInterval / 60000),
  set: (val) => {
    globalSettings.value.refreshCheckInterval = val * 60000
  },
})

const hasMoreElements = computed(() => {
  if (!cacheStats.value) return false
  return browserElements.value.length < cacheStats.value.totalCount
})

// Methods
function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section]
}

function toggleFilter(type: OntologyElementType) {
  const index = browserFilter.value.indexOf(type)
  if (index > -1) {
    browserFilter.value.splice(index, 1)
  } else {
    browserFilter.value.push(type)
  }
  loadBrowserElements()
}

function getTypeCount(type: OntologyElementType): number {
  if (!cacheStats.value) return 0
  switch (type) {
    case 'class':
      return cacheStats.value.classCount
    case 'property':
      return cacheStats.value.propertyCount
    case 'individual':
      return cacheStats.value.individualCount
    default:
      return 0
  }
}

function getElementIcon(type: OntologyElementType): string {
  const typeObj = elementTypes.find((t) => t.value === type)
  return typeObj?.icon || '❓'
}

async function loadBrowserElements() {
  if (!selectedBackendId.value) return

  isBrowserLoading.value = true
  try {
    const results = await cacheStore.searchElements(selectedBackendId.value, {
      query: browserSearch.value,
      types: browserFilter.value.length > 0 ? browserFilter.value : undefined,
      limit: browserLimit.value,
      caseSensitive: false,
      prefixOnly: false,
    })

    browserElements.value = results.map((r) => r.element)
  } catch (error) {
    console.error('Failed to load browser elements:', error)
    browserElements.value = []
  } finally {
    isBrowserLoading.value = false
  }
}

function loadMoreElements() {
  browserLimit.value += 50
  loadBrowserElements()
}

let searchDebounceTimeout: ReturnType<typeof setTimeout>
function onBrowserSearchChange() {
  clearTimeout(searchDebounceTimeout)
  searchDebounceTimeout = setTimeout(() => {
    browserLimit.value = 50 // Reset limit on new search
    loadBrowserElements()
  }, 300)
}

async function selectElement(element: AnyOntologyElement) {
  try {
    // Copy IRI to clipboard
    await navigator.clipboard.writeText(element.iri)

    // Show success message in browser controls
    browserCopyMessage.value = `✓ Copied: ${element.label || element.localName || 'IRI'}`
    browserCopyMessageType.value = 'success'

    // Clear message after 3 seconds
    setTimeout(() => {
      browserCopyMessage.value = ''
    }, 3000)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    browserCopyMessage.value = '✗ Failed to copy'
    browserCopyMessageType.value = 'error'

    setTimeout(() => {
      browserCopyMessage.value = ''
    }, 3000)
  }
}

function onBackendChange() {
  if (!selectedBackend.value) return

  const config = selectedBackend.value.cacheConfig || DEFAULT_CACHE_CONFIG
  cacheEnabled.value = config.enabled
  ttlHours.value = Math.round(config.ttl / 3600000)
  maxElements.value = config.maxElements
  classesQuery.value = config.queries.classes
  propertiesQuery.value = config.queries.properties
  individualsQuery.value = config.queries.individuals
  testResults.value = {}

  // Load cache stats and browser
  loadCacheStats()
  loadBrowserElements()
}

async function onCacheEnabledChange() {
  if (!cacheEnabled.value) {
    cacheStats.value = null
    cacheMetadata.value = null
    browserElements.value = []
  } else {
    // Load existing cache stats first
    await loadCacheStats()

    // If no cache exists, automatically fetch it
    if (!cacheStats.value && selectedBackendId.value) {
      console.log('Cache enabled but no data exists, triggering initial fetch...')
      await refreshCache()
    } else {
      // Just load browser elements if cache already exists
      loadBrowserElements()
    }
  }
}

async function loadCacheStats() {
  if (!selectedBackendId.value) return

  try {
    const validation = await cacheStore.validateCache(selectedBackendId.value)
    if (validation.exists) {
      const stats = await cacheStore.getStats(selectedBackendId.value)
      const cache = await cacheStore.getCache(selectedBackendId.value)
      cacheStats.value = stats
      cacheMetadata.value = cache ? cache.metadata : null
    } else {
      cacheStats.value = null
      cacheMetadata.value = null
    }
  } catch (error) {
    console.error('Failed to load cache stats:', error)
  }
}

async function refreshCache() {
  if (!selectedBackendId.value) return

  isRefreshing.value = true
  try {
    await cacheStore.refreshCache(selectedBackendId.value, false)
    await loadCacheStats()
    loadBrowserElements()
    saveMessage.value = 'Cache refreshed successfully!'
    saveMessageType.value = 'success'
  } catch (error) {
    saveMessage.value = `Failed to refresh cache: ${error instanceof Error ? error.message : 'Unknown error'}`
    saveMessageType.value = 'error'
  } finally {
    isRefreshing.value = false
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
}

async function clearCache() {
  if (!selectedBackendId.value) return

  if (!confirm('Are you sure you want to clear the cache? This cannot be undone.')) {
    return
  }

  try {
    await cacheStore.invalidateCache(selectedBackendId.value)
    cacheStats.value = null
    cacheMetadata.value = null
    browserElements.value = []
    saveMessage.value = 'Cache cleared successfully!'
    saveMessageType.value = 'success'
  } catch (error) {
    saveMessage.value = `Failed to clear cache: ${error instanceof Error ? error.message : 'Unknown error'}`
    saveMessageType.value = 'error'
  } finally {
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
}

async function testQuery(type: 'classes' | 'properties' | 'individuals') {
  if (!selectedBackendId.value) return

  const queryMap = {
    classes: classesQuery.value,
    properties: propertiesQuery.value,
    individuals: individualsQuery.value,
  }

  isTestingQuery.value = true
  try {
    const result = await window.electronAPI.cache.testQuery(selectedBackendId.value, queryMap[type])
    testResults.value[type] = result
  } catch (error) {
    testResults.value[type] = {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    isTestingQuery.value = false
  }
}

function resetQuery(type: 'classes' | 'properties' | 'individuals') {
  const defaults = DEFAULT_CACHE_CONFIG.queries
  switch (type) {
    case 'classes':
      classesQuery.value = defaults.classes
      break
    case 'properties':
      classesQuery.value = defaults.properties
      break
    case 'individuals':
      individualsQuery.value = defaults.individuals
      break
  }
  testResults.value[type] = undefined as any
}

function saveSettings() {
  try {
    // Save backend-specific config
    if (selectedBackend.value) {
      const cacheConfig: CacheConfig = {
        enabled: cacheEnabled.value,
        ttl: ttlHours.value * 3600000,
        maxElements: maxElements.value,
        queries: {
          classes: classesQuery.value,
          properties: propertiesQuery.value,
          individuals: individualsQuery.value,
        },
      }

      // Update backend config via connectionStore
      connectionStore.updateBackend(selectedBackend.value.id, {
        cacheConfig,
      })
    }

    // Save global settings
    saveCacheSettings(globalSettings.value)

    saveMessage.value = 'Settings saved successfully!'
    saveMessageType.value = 'success'
  } catch (error) {
    saveMessage.value = `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`
    saveMessageType.value = 'error'
  } finally {
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
}

function resetToDefaults() {
  globalSettings.value = {
    enableAutocomplete: true,
    defaultTtl: 24 * 60 * 60 * 1000,
    defaultMaxElements: 50000,
    autoRefresh: true,
    refreshCheckInterval: 5 * 60 * 1000,
  }

  if (selectedBackend.value) {
    cacheEnabled.value = false
    ttlHours.value = 24
    maxElements.value = 50000
    classesQuery.value = DEFAULT_CACHE_CONFIG.queries.classes
    propertiesQuery.value = DEFAULT_CACHE_CONFIG.queries.properties
    individualsQuery.value = DEFAULT_CACHE_CONFIG.queries.individuals
    testResults.value = {}
  }

  saveMessage.value = 'Reset to default values. Click Save to apply.'
  saveMessageType.value = 'success'
  setTimeout(() => {
    saveMessage.value = ''
  }, 3000)
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'Never'
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  return `${days} day${days > 1 ? 's' : ''} ago`
}

onMounted(() => {
  globalSettings.value = getCacheSettings()

  // Auto-select first backend if available
  if (backends.value.length > 0 && !selectedBackendId.value) {
    selectedBackendId.value = backends.value[0].id
    onBackendChange()
  }
})
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-main);
}

.settings-header {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.settings-header h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.settings-description {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.settings-section {
  margin-bottom: 16px;
}

/* Collapsible Sections */
.collapsible-section {
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
  text-align: left;
}

.section-header:hover {
  background: var(--color-bg-hover);
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.expand-icon {
  font-size: 12px;
  color: var(--color-text-secondary);
  transition: transform 0.2s ease;
  width: 16px;
}

.element-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: normal;
  opacity: 0.7;
}

.section-content {
  padding: 20px;
  background: var(--color-bg-main);
}

.section-description {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* Browser Styles */
.browser-controls {
  margin-bottom: 16px;
}

.search-box {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: inherit;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
}

.copy-notification {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  animation: slideIn 0.2s ease;
}

.copy-notification.success {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.copy-notification.error {
  background: rgba(244, 67, 54, 0.15);
  color: #f44336;
  border: 1px solid rgba(244, 67, 54, 0.3);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.filter-btn {
  padding: 8px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
}

.filter-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.browser-results {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-input);
}

.browser-loading,
.browser-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.element-list {
  padding: 8px;
}

.element-item {
  padding: 12px;
  margin-bottom: 8px;
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.element-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.element-item:active {
  transform: translateY(0);
}

.element-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.element-icon {
  font-size: 16px;
}

.element-label {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
  color: var(--color-text-primary);
}

.element-type {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
}

.element-iri {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  margin-bottom: 4px;
  word-break: break-all;
  opacity: 0.8;
}

.element-description {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin-bottom: 8px;
}

.element-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border-radius: 3px;
}

.load-more {
  padding: 12px;
  text-align: center;
  border-top: 1px solid var(--color-border);
}

/* Form Styles */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin: 0;
  cursor: pointer;
}

.form-group input[type='number'],
.form-group select {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: inherit;
}

.form-group input[type='number']:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-unit input {
  flex: 1;
}

.unit {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.help-text {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.cache-status {
  margin-top: 16px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.cache-status h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.status-label {
  color: var(--color-text-secondary);
}

.status-value {
  color: var(--color-text-primary);
  font-weight: 500;
}

.no-cache-message {
  padding: 16px;
  margin-bottom: 12px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 13px;
  background: var(--color-bg-main);
  border: 1px dashed var(--color-border);
  border-radius: 4px;
}

.cache-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.query-group {
  margin-bottom: 24px;
}

.query-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.query-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.query-actions {
  display: flex;
  gap: 12px;
}

.query-textarea {
  width: 100%;
  padding: 12px;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  line-height: 1.5;
  resize: vertical;
}

.query-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.test-result.success {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.test-result.error {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
  border: 1px solid rgba(244, 67, 54, 0.3);
}

.settings-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
}

.btn-primary,
.btn-secondary,
.btn-link {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-link {
  background: transparent;
  color: var(--color-primary);
  padding: 4px 8px;
}

.btn-link:hover {
  background: var(--color-bg-hover);
}

.btn-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
}

.save-message.success {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.save-message.error {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
  border: 1px solid rgba(244, 67, 54, 0.3);
}
</style>
