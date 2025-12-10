<template>
  <div class="connection-form">
    <div class="form-header">
      <h2>{{ isEditing ? 'Edit Backend' : 'Add Backend' }}</h2>
      <button class="btn-text" @click="$emit('cancel')">✕</button>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="name">Name *</label>
        <input
          id="name"
          v-model="formData.name"
          type="text"
          placeholder="My SPARQL Endpoint"
          maxlength="50"
          :class="{ error: errors.name }"
        />
        <span v-if="errors.name" class="error-message">{{ errors.name }}</span>
      </div>

      <div class="form-group">
        <label for="type">Backend Type *</label>
        <select id="type" v-model="formData.type">
          <option value="sparql-1.1">Generic SPARQL 1.1</option>
          <option value="graphstudio">Altair Graph Studio</option>
          <option value="mobi">Mobi</option>
          <option value="neptune">AWS Neptune</option>
          <option value="stardog">Stardog</option>
        </select>
      </div>

      <div class="form-group">
        <label for="endpoint">Endpoint URL *</label>
        <input
          id="endpoint"
          v-model="formData.endpoint"
          type="url"
          placeholder="https://dbpedia.org/sparql"
          :class="{ error: errors.endpoint }"
        />
        <span v-if="errors.endpoint" class="error-message">{{ errors.endpoint }}</span>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input v-model="formData.allowInsecure" type="checkbox" />
          <span>Allow insecure SSL certificates (self-signed/invalid)</span>
        </label>
        <p class="hint-text">Enable this for development servers with self-signed certificates</p>
      </div>

      <div class="form-group">
        <label for="authType">Authentication *</label>
        <select id="authType" v-model="formData.authType">
          <option value="none">No Authentication</option>
          <option value="basic">Basic Auth (Username/Password)</option>
          <option value="bearer">Bearer Token</option>
          <option value="custom">Custom Headers</option>
        </select>
      </div>

      <!-- Basic Auth Fields -->
      <template v-if="formData.authType === 'basic'">
        <div class="form-group">
          <label for="username">Username *</label>
          <input
            id="username"
            v-model="formData.username"
            type="text"
            autocomplete="username"
            :class="{ error: errors.username }"
          />
          <span v-if="errors.username" class="error-message">{{ errors.username }}</span>
        </div>

        <div class="form-group">
          <label for="password">Password *</label>
          <input
            id="password"
            v-model="formData.password"
            type="password"
            autocomplete="current-password"
            :class="{ error: errors.password }"
          />
          <span v-if="errors.password" class="error-message">{{ errors.password }}</span>
        </div>
      </template>

      <!-- Bearer Token Field -->
      <template v-if="formData.authType === 'bearer'">
        <div class="form-group">
          <label for="token">Bearer Token *</label>
          <textarea
            id="token"
            v-model="formData.token"
            rows="3"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            :class="{ error: errors.token }"
          ></textarea>
          <span v-if="errors.token" class="error-message">{{ errors.token }}</span>
        </div>
      </template>

      <!-- Custom Headers -->
      <template v-if="formData.authType === 'custom'">
        <div class="form-group">
          <label>Custom Headers *</label>
          <div class="custom-headers">
            <div v-for="(header, index) in formData.customHeaders" :key="index" class="header-row">
              <input
                v-model="header.key"
                type="text"
                placeholder="Header name"
                class="header-key"
              />
              <input
                v-model="header.value"
                type="text"
                placeholder="Header value"
                class="header-value"
              />
              <button
                type="button"
                class="btn-icon-sm"
                title="Remove header"
                @click="removeHeader(index)"
              >
                ✕
              </button>
            </div>
            <button type="button" class="btn-secondary btn-sm" @click="addHeader">
              + Add Header
            </button>
          </div>
          <span v-if="errors.customHeaders" class="error-message">{{ errors.customHeaders }}</span>
        </div>
      </template>

      <!-- GraphStudio-specific configuration -->
      <template v-if="formData.type === 'graphstudio'">
        <div class="form-section-divider"></div>

        <div class="form-group">
          <label>Graphmart *</label>
          <div class="graphmart-selector">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="!canLoadGraphmarts || graphstudioAPI.isLoading.value"
              @click="loadGraphmartsFromServer"
            >
              {{ graphstudioAPI.isLoading.value ? 'Loading...' : 'Load Graphmarts' }}
            </button>

            <button
              v-if="graphstudioAPI.hasGraphmarts.value"
              type="button"
              class="btn-icon-sm"
              title="Refresh graphmart list"
              @click="refreshGraphmarts"
            >
              🔄
            </button>
          </div>

          <select
            v-if="graphstudioAPI.hasGraphmarts.value"
            v-model="formData.graphmartUri"
            :class="{ error: errors.graphmart }"
            class="graphmart-dropdown"
            @change="onGraphmartSelected"
          >
            <option value="">Select a graphmart...</option>
            <option v-for="gm in graphstudioAPI.graphmarts.value" :key="gm.uri" :value="gm.uri">
              {{ getGraphmartStatusIcon(gm.status) }} {{ gm.name }}
            </option>
          </select>

          <span v-if="errors.graphmart" class="error-message">{{ errors.graphmart }}</span>
          <span v-if="graphstudioAPI.error.value" class="error-message">
            {{ graphstudioAPI.error.value }}
          </span>
        </div>

        <!-- Layer selection (only show if graphmart selected) -->
        <div v-if="formData.graphmartUri && selectedGraphmart" class="form-group">
          <label>Layers</label>
          <div class="layer-selection">
            <label class="checkbox-label">
              <input v-model="useAllLayers" type="checkbox" @change="onAllLayersToggle" />
              <span>All Layers (default)</span>
            </label>

            <div v-if="!useAllLayers && selectedGraphmart.layers.length > 0" class="layer-list">
              <label
                v-for="layer in selectedGraphmart.layers"
                :key="layer.uri"
                class="checkbox-label"
              >
                <input v-model="formData.selectedLayers" type="checkbox" :value="layer.uri" />
                <span>{{ layer.name }}</span>
              </label>
            </div>

            <p v-if="!useAllLayers && selectedGraphmart.layers.length === 0" class="hint-text">
              No layers available for this graphmart
            </p>
          </div>
        </div>
      </template>

      <!-- Mobi-specific configuration -->
      <template v-if="formData.type === 'mobi'">
        <div class="form-section-divider"></div>

        <!-- Query Mode Selection -->
        <div class="form-group">
          <label>Query Mode *</label>
          <div class="query-mode-selection">
            <label class="radio-label">
              <input
                v-model="mobiQueryMode"
                type="radio"
                value="repository"
                @change="onQueryModeChanged"
              />
              <span>Repository-wide queries</span>
            </label>
            <label class="radio-label">
              <input
                v-model="mobiQueryMode"
                type="radio"
                value="record"
                @change="onQueryModeChanged"
              />
              <span>Record-specific queries</span>
            </label>
          </div>
          <p class="hint-text">
            Repository-wide queries search across all data in a repository. Record-specific queries
            are scoped to a single catalog record.
          </p>
        </div>

        <!-- Repository Selection (shown when mode = 'repository') -->
        <div v-if="mobiQueryMode === 'repository'" class="form-group">
          <label>Repository *</label>
          <div class="mobi-selector">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="!canLoadMobiResources || mobiAPI.isLoadingRepositories.value"
              @click="loadRepositoriesFromServer"
            >
              {{ mobiAPI.isLoadingRepositories.value ? 'Loading...' : 'Load Repositories' }}
            </button>

            <button
              v-if="mobiAPI.hasRepositories.value"
              type="button"
              class="btn-icon-sm"
              title="Refresh repository list"
              @click="refreshRepositories"
            >
              🔄
            </button>
          </div>

          <select
            v-if="mobiAPI.hasRepositories.value"
            v-model="formData.repositoryId"
            :class="{ error: errors.repository }"
            class="mobi-dropdown"
            @change="onRepositorySelected"
          >
            <option value="">Select a repository...</option>
            <option v-for="repo in mobiAPI.repositories.value" :key="repo.id" :value="repo.id">
              {{ repo.title }}
            </option>
          </select>

          <span v-if="errors.repository" class="error-message">{{ errors.repository }}</span>
          <span v-if="mobiAPI.error.value" class="error-message">
            {{ mobiAPI.error.value }}
          </span>
        </div>

        <!-- Catalog Selection (shown when mode = 'record') -->
        <div v-if="mobiQueryMode === 'record'" class="form-group">
          <label>Catalog *</label>
          <div class="mobi-selector">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="!canLoadMobiResources || mobiAPI.isLoadingCatalogs.value"
              @click="loadCatalogsFromServer"
            >
              {{ mobiAPI.isLoadingCatalogs.value ? 'Loading...' : 'Load Catalogs' }}
            </button>

            <button
              v-if="mobiAPI.hasCatalogs.value"
              type="button"
              class="btn-icon-sm"
              title="Refresh catalog list"
              @click="refreshCatalogs"
            >
              🔄
            </button>
          </div>

          <select
            v-if="mobiAPI.hasCatalogs.value"
            v-model="formData.catalogId"
            :class="{ error: errors.catalog }"
            class="mobi-dropdown"
            @change="onCatalogSelected"
          >
            <option value="">Select a catalog...</option>
            <option v-for="cat in mobiAPI.catalogs.value" :key="cat.id" :value="cat.id">
              {{ cat.title }}
            </option>
          </select>

          <span v-if="errors.catalog" class="error-message">{{ errors.catalog }}</span>
          <span v-if="mobiAPI.error.value" class="error-message">
            {{ mobiAPI.error.value }}
          </span>
        </div>

        <!-- Record Type Filter -->
        <div v-if="mobiQueryMode === 'record' && formData.catalogId" class="form-group">
          <label>Record Type Filter (optional)</label>
          <div class="record-type-selection">
            <label v-for="type in availableRecordTypes" :key="type.iri" class="checkbox-label">
              <input
                v-model="selectedRecordTypes"
                type="checkbox"
                :value="type.iri"
                @change="onRecordTypeChanged"
              />
              <span>{{ type.label }}</span>
            </label>
          </div>
        </div>

        <!-- Record Selection -->
        <div v-if="mobiQueryMode === 'record' && formData.catalogId" class="form-group">
          <label>Record *</label>
          <div class="mobi-selector">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="!formData.catalogId || mobiAPI.isLoadingRecords.value"
              @click="loadRecordsFromServer"
            >
              {{ mobiAPI.isLoadingRecords.value ? 'Loading...' : 'Load Records' }}
            </button>

            <button
              v-if="mobiAPI.hasRecords.value"
              type="button"
              class="btn-icon-sm"
              title="Refresh record list"
              @click="refreshRecords"
            >
              🔄
            </button>
          </div>

          <select
            v-if="mobiAPI.hasRecords.value"
            v-model="formData.recordId"
            :class="{ error: errors.record }"
            class="mobi-dropdown"
            @change="onRecordSelected"
          >
            <option value="">Select a record...</option>
            <option v-for="rec in mobiAPI.records.value" :key="rec.id" :value="rec.id">
              {{ rec.title }}
            </option>
          </select>

          <span v-if="errors.record" class="error-message">{{ errors.record }}</span>
        </div>

        <!-- Branch Selection -->
        <div v-if="mobiQueryMode === 'record' && formData.recordId" class="form-group">
          <label>Branch (optional for flexible scoping)</label>
          <div class="mobi-selector">
            <button
              type="button"
              class="btn-secondary btn-sm"
              :disabled="!formData.recordId || mobiAPI.isLoadingBranches.value"
              @click="loadBranchesFromServer"
            >
              {{ mobiAPI.isLoadingBranches.value ? 'Loading...' : 'Load Branches' }}
            </button>

            <button
              v-if="mobiAPI.hasBranches.value"
              type="button"
              class="btn-icon-sm"
              title="Refresh branch list"
              @click="refreshBranches"
            >
              🔄
            </button>
          </div>

          <select
            v-if="mobiAPI.hasBranches.value"
            v-model="formData.branchId"
            class="mobi-dropdown"
          >
            <option value="">All branches (no scoping)</option>
            <option v-for="branch in mobiAPI.branches.value" :key="branch.id" :value="branch.id">
              {{ branch.title }}
            </option>
          </select>
        </div>

        <!-- Include Imports -->
        <div v-if="formData.recordId" class="form-group">
          <label class="checkbox-label">
            <input v-model="formData.includeImports" type="checkbox" />
            <span>Include imports in queries</span>
          </label>
        </div>
      </template>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="$emit('cancel')">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="isSaving">
          {{ isSaving ? 'Saving...' : isEditing ? 'Update' : 'Create' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { BackendConfig } from '@/types/backends'
import type {
  Graphmart,
  MobiCatalog,
  MobiRecord,
  MobiRepository,
} from '@/types/electron'
import { useBackendValidation, type BackendFormData } from '@/composables/useBackendValidation'
import { useGraphStudioAPI } from '@/composables/useGraphStudioAPI'
import { useMobiAPI } from '@/composables/useMobiAPI'
import { MOBI_RECORD_TYPE_IRIS } from '@/../../main/src/backends/providers/mobi-types'

interface Props {
  backend?: BackendConfig
}

const props = defineProps<Props>()

const emit = defineEmits<{
  save: [data: BackendFormData]
  cancel: []
}>()

const isEditing = !!props.backend
const isSaving = ref(false)

// GraphStudio API composable
const graphstudioAPI = useGraphStudioAPI()

// GraphStudio state
const useAllLayers = ref(true)
const selectedGraphmart = ref<Graphmart | null>(null)

// Mobi API composable
const mobiAPI = useMobiAPI()

// Mobi state
const mobiQueryMode = ref<'repository' | 'record'>('record')
const selectedRecordTypes = ref<string[]>([])
const selectedCatalog = ref<MobiCatalog | null>(null)
const selectedRecord = ref<MobiRecord | null>(null)
const selectedRepository = ref<MobiRepository | null>(null)

// Available record types for filtering
const availableRecordTypes = [
  { iri: MOBI_RECORD_TYPE_IRIS['ontology-record'], label: 'Ontology' },
  { iri: MOBI_RECORD_TYPE_IRIS['dataset-record'], label: 'Dataset' },
  { iri: MOBI_RECORD_TYPE_IRIS['mapping-record'], label: 'Mapping' },
  { iri: MOBI_RECORD_TYPE_IRIS['shapes-graph-record'], label: 'Shapes Graph' },
]

// Parse existing provider config if editing GraphStudio backend
let initialGraphmartUri = ''
let initialGraphmartName = ''
let initialSelectedLayers: string[] = []

if (props.backend && props.backend.type === 'graphstudio' && props.backend.providerConfig) {
  try {
    const providerConfig = JSON.parse(props.backend.providerConfig)
    initialGraphmartUri = providerConfig.graphmartUri || ''
    initialGraphmartName = providerConfig.graphmartName || ''
    initialSelectedLayers = providerConfig.selectedLayers || []
    useAllLayers.value =
      initialSelectedLayers.length === 0 || initialSelectedLayers.includes('ALL_LAYERS')
  } catch (e) {
    console.error('Failed to parse provider config:', e)
  }
}

// Parse existing provider config if editing Mobi backend
let initialQueryMode: 'repository' | 'record' = 'record'
let initialRepositoryId = ''
let initialRepositoryTitle = ''
let initialCatalogId = ''
let initialCatalogTitle = ''
let initialRecordId = ''
let initialRecordTitle = ''
let initialRecordType = ''
let initialBranchId = ''
let initialBranchTitle = ''
let initialIncludeImports = false

if (props.backend && props.backend.type === 'mobi' && props.backend.providerConfig) {
  try {
    const providerConfig = JSON.parse(props.backend.providerConfig)
    initialQueryMode = providerConfig.queryMode || 'record'
    initialRepositoryId = providerConfig.repositoryId || ''
    initialRepositoryTitle = providerConfig.repositoryTitle || ''
    initialCatalogId = providerConfig.catalogId || ''
    initialCatalogTitle = providerConfig.catalogTitle || ''
    initialRecordId = providerConfig.recordId || ''
    initialRecordTitle = providerConfig.recordTitle || ''
    initialRecordType = providerConfig.recordType || ''
    initialBranchId = providerConfig.branchId || ''
    initialBranchTitle = providerConfig.branchTitle || ''
    initialIncludeImports = providerConfig.includeImports || false
  } catch (e) {
    console.error('Failed to parse Mobi provider config:', e)
  }
}

// Set initial query mode
mobiQueryMode.value = initialQueryMode

// Initialize form data
const formData = ref<BackendFormData>({
  name: props.backend?.name || '',
  type: (props.backend?.type as any) || 'sparql-1.1',
  endpoint: props.backend?.endpoint || '',
  authType: (props.backend?.authType as any) || 'none',
  allowInsecure: props.backend?.allowInsecure || false,
  username: '',
  password: '',
  token: '',
  customHeaders: [{ key: '', value: '' }],
  graphmartUri: initialGraphmartUri,
  graphmartName: initialGraphmartName,
  selectedLayers: useAllLayers.value ? ['ALL_LAYERS'] : initialSelectedLayers,
  // Mobi fields
  queryMode: initialQueryMode,
  repositoryId: initialRepositoryId,
  repositoryTitle: initialRepositoryTitle,
  catalogId: initialCatalogId,
  catalogTitle: initialCatalogTitle,
  recordId: initialRecordId,
  recordTitle: initialRecordTitle,
  recordType: initialRecordType,
  branchId: initialBranchId,
  branchTitle: initialBranchTitle,
  includeImports: initialIncludeImports,
})

const { errors, validateForm, clearErrors } = useBackendValidation()

// Clear credentials when auth type changes
watch(
  () => formData.value.authType,
  () => {
    formData.value.username = ''
    formData.value.password = ''
    formData.value.token = ''
    formData.value.customHeaders = [{ key: '', value: '' }]
    clearErrors()
  }
)

// Watch for backend type changes
watch(
  () => formData.value.type,
  (newType) => {
    // Clear GraphStudio-specific fields when switching away
    if (newType !== 'graphstudio') {
      formData.value.graphmartUri = ''
      formData.value.graphmartName = ''
      formData.value.selectedLayers = []
      selectedGraphmart.value = null
    }

    // Clear Mobi-specific fields when switching away
    if (newType !== 'mobi') {
      formData.value.queryMode = 'record'
      formData.value.repositoryId = ''
      formData.value.repositoryTitle = ''
      formData.value.catalogId = ''
      formData.value.catalogTitle = ''
      formData.value.recordId = ''
      formData.value.recordTitle = ''
      formData.value.recordType = ''
      formData.value.branchId = ''
      formData.value.branchTitle = ''
      formData.value.includeImports = false
      selectedRepository.value = null
      selectedCatalog.value = null
      selectedRecord.value = null
      selectedRecordTypes.value = []
    }
  }
)

// Computed: Can load graphmarts (need endpoint and optional credentials)
const canLoadGraphmarts = computed(() => {
  if (!formData.value.endpoint) return false

  // If Basic Auth selected, require credentials
  if (formData.value.authType === 'basic') {
    return !!formData.value.username && !!formData.value.password
  }

  return true
})

// GraphStudio: Load graphmarts from server
async function loadGraphmartsFromServer() {
  if (!canLoadGraphmarts.value) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await graphstudioAPI.loadGraphmarts(
    formData.value.endpoint,
    credentials,
    false,
    formData.value.allowInsecure
  )
}

// GraphStudio: Refresh graphmarts
async function refreshGraphmarts() {
  if (!canLoadGraphmarts.value) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await graphstudioAPI.refreshGraphmarts(
    formData.value.endpoint,
    credentials,
    formData.value.allowInsecure
  )
}

// GraphStudio: Get status icon for graphmart
function getGraphmartStatusIcon(status: 'active' | 'inactive' | 'error'): string {
  switch (status) {
    case 'active':
      return '●'
    case 'inactive':
      return '○'
    case 'error':
      return '⚠'
    default:
      return '○'
  }
}

// GraphStudio: When graphmart is selected
function onGraphmartSelected() {
  const graphmart = graphstudioAPI.graphmarts.value.find(
    (gm) => gm.uri === formData.value.graphmartUri
  )

  if (graphmart) {
    selectedGraphmart.value = graphmart
    formData.value.graphmartName = graphmart.name

    // Reset layer selection
    useAllLayers.value = true
    formData.value.selectedLayers = ['ALL_LAYERS']
  } else {
    selectedGraphmart.value = null
    formData.value.graphmartName = ''
  }
}

// GraphStudio: Toggle all layers checkbox
function onAllLayersToggle() {
  if (useAllLayers.value) {
    formData.value.selectedLayers = ['ALL_LAYERS']
  } else {
    formData.value.selectedLayers = []
  }
}

// Computed: Can load Mobi resources (need endpoint and credentials)
const canLoadMobiResources = computed(() => {
  if (!formData.value.endpoint) return false

  // Mobi always requires credentials (JWT authentication)
  if (formData.value.authType === 'basic') {
    return !!formData.value.username && !!formData.value.password
  }

  return true
})

// Mobi: Load catalogs from server
async function loadCatalogsFromServer() {
  if (!canLoadMobiResources.value) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadCatalogs(
    formData.value.endpoint,
    credentials,
    false,
    formData.value.allowInsecure
  )
}

// Mobi: Refresh catalogs
async function refreshCatalogs() {
  if (!canLoadMobiResources.value) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  mobiAPI.clearCache()
  await mobiAPI.loadCatalogs(
    formData.value.endpoint,
    credentials,
    true,
    formData.value.allowInsecure
  )
}

// Mobi: When catalog is selected
function onCatalogSelected() {
  const catalog = mobiAPI.catalogs.value.find((cat) => cat.id === formData.value.catalogId)

  if (catalog) {
    selectedCatalog.value = catalog
    formData.value.catalogTitle = catalog.title

    // Reset dependent selections
    formData.value.recordId = ''
    formData.value.recordTitle = ''
    formData.value.recordType = ''
    formData.value.branchId = ''
    formData.value.branchTitle = ''
    selectedRecord.value = null
    mobiAPI.records.value = []
    mobiAPI.branches.value = []
  } else {
    selectedCatalog.value = null
    formData.value.catalogTitle = ''
  }
}

// Mobi: When record type filter changes
function onRecordTypeChanged() {
  // Clear records when filter changes
  mobiAPI.records.value = []
  formData.value.recordId = ''
  formData.value.recordTitle = ''
  formData.value.recordType = ''
}

// Mobi: Load records from server
async function loadRecordsFromServer() {
  if (!formData.value.catalogId) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadRecords(
    formData.value.endpoint,
    formData.value.catalogId,
    selectedRecordTypes.value.length > 0 ? selectedRecordTypes.value : undefined,
    credentials,
    false,
    formData.value.allowInsecure
  )
}

// Mobi: Refresh records
async function refreshRecords() {
  if (!formData.value.catalogId) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadRecords(
    formData.value.endpoint,
    formData.value.catalogId,
    selectedRecordTypes.value.length > 0 ? selectedRecordTypes.value : undefined,
    credentials,
    true,
    formData.value.allowInsecure
  )
}

// Mobi: When record is selected
function onRecordSelected() {
  const record = mobiAPI.records.value.find((rec) => rec.id === formData.value.recordId)

  if (record) {
    selectedRecord.value = record
    formData.value.recordTitle = record.title
    formData.value.recordType = record.type

    // Reset branch selection
    formData.value.branchId = ''
    formData.value.branchTitle = ''
    mobiAPI.branches.value = []
  } else {
    selectedRecord.value = null
    formData.value.recordTitle = ''
    formData.value.recordType = ''
  }
}

// Mobi: Load branches from server
async function loadBranchesFromServer() {
  if (!formData.value.catalogId || !formData.value.recordId) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadBranches(
    formData.value.endpoint,
    formData.value.catalogId,
    formData.value.recordId,
    credentials,
    false,
    formData.value.allowInsecure
  )
}

// Mobi: Refresh branches
async function refreshBranches() {
  if (!formData.value.catalogId || !formData.value.recordId) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadBranches(
    formData.value.endpoint,
    formData.value.catalogId,
    formData.value.recordId,
    credentials,
    true,
    formData.value.allowInsecure
  )
}

// Mobi: When query mode changes
function onQueryModeChanged() {
  // Clear selections when switching modes
  if (mobiQueryMode.value === 'repository') {
    // Switched to repository mode - clear record selections
    formData.value.catalogId = ''
    formData.value.catalogTitle = ''
    formData.value.recordId = ''
    formData.value.recordTitle = ''
    formData.value.recordType = ''
    formData.value.branchId = ''
    formData.value.branchTitle = ''
    selectedCatalog.value = null
    selectedRecord.value = null
    selectedRecordTypes.value = []
    mobiAPI.records.value = []
    mobiAPI.branches.value = []
  } else {
    // Switched to record mode - clear repository selection
    formData.value.repositoryId = ''
    formData.value.repositoryTitle = ''
    selectedRepository.value = null
  }

  // Update form data query mode
  formData.value.queryMode = mobiQueryMode.value
}

// Mobi: Load repositories from server
async function loadRepositoriesFromServer() {
  if (!canLoadMobiResources.value) return

  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadRepositories(
    formData.value.endpoint,
    credentials,
    false,
    formData.value.allowInsecure
  )
}

// Mobi: Refresh repositories
async function refreshRepositories() {
  const credentials =
    formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined

  await mobiAPI.loadRepositories(
    formData.value.endpoint,
    credentials,
    true,
    formData.value.allowInsecure
  )
}

// Mobi: When repository is selected
function onRepositorySelected() {
  console.log('[ConnectionForm] Repository selected:', formData.value.repositoryId)
  console.log('[ConnectionForm] Available repositories:', mobiAPI.repositories.value)

  const repository = mobiAPI.repositories.value.find(
    (repo) => repo.id === formData.value.repositoryId
  )

  console.log('[ConnectionForm] Found repository:', repository)

  if (repository) {
    selectedRepository.value = repository
    formData.value.repositoryTitle = repository.title
    console.log('[ConnectionForm] Updated formData with repository:', {
      repositoryId: formData.value.repositoryId,
      repositoryTitle: formData.value.repositoryTitle,
    })
  } else {
    selectedRepository.value = null
    formData.value.repositoryTitle = ''
    console.warn('[ConnectionForm] Repository not found in list')
  }
}

// Load existing credentials when editing
async function loadExistingCredentials() {
  if (!isEditing || !props.backend) return

  try {
    const credentials = await window.electronAPI.backends.getCredentials(props.backend.id)

    if (credentials) {
      // Populate form with existing credentials
      if (credentials.username) formData.value.username = credentials.username
      if (credentials.password) formData.value.password = credentials.password
      if (credentials.token) formData.value.token = credentials.token
      if (credentials.headers) {
        formData.value.customHeaders = Object.entries(credentials.headers).map(([key, value]) => ({
          key,
          value,
        }))
      }
    }
  } catch (error) {
    console.error('Failed to load credentials:', error)
  }
}

// Auto-load credentials and graphmarts when editing
onMounted(async () => {
  // Load credentials first
  await loadExistingCredentials()

  // Then load graphmarts for GraphStudio backends
  if (isEditing && formData.value.type === 'graphstudio' && formData.value.endpoint) {
    const credentials =
      formData.value.authType === 'basic'
        ? { username: formData.value.username, password: formData.value.password }
        : undefined

    await graphstudioAPI.loadGraphmarts(
      formData.value.endpoint,
      credentials,
      false,
      formData.value.allowInsecure
    )

    // Restore selected graphmart if it exists in the list
    if (formData.value.graphmartUri) {
      const graphmart = graphstudioAPI.graphmarts.value.find(
        (gm) => gm.uri === formData.value.graphmartUri
      )
      if (graphmart) {
        selectedGraphmart.value = graphmart
      }
    }
  }

  // Load Mobi resources when editing Mobi backend
  if (isEditing && formData.value.type === 'mobi' && formData.value.endpoint) {
    const credentials =
      formData.value.authType === 'basic'
        ? { username: formData.value.username, password: formData.value.password }
        : undefined

    if (canLoadMobiResources.value) {
      // Handle repository mode
      if (mobiQueryMode.value === 'repository') {
        // Load repositories
        await mobiAPI.loadRepositories(
          formData.value.endpoint,
          credentials,
          false,
          formData.value.allowInsecure
        )

        // Restore selected repository
        if (formData.value.repositoryId) {
          const repository = mobiAPI.repositories.value.find(
            (repo) => repo.id === formData.value.repositoryId
          )
          if (repository) {
            selectedRepository.value = repository
          }
        }
      } else {
        // Handle record mode (default)
        // Load catalogs
        await mobiAPI.loadCatalogs(
          formData.value.endpoint,
          credentials,
          false,
          formData.value.allowInsecure
        )

        // Restore selected catalog
        if (formData.value.catalogId) {
          const catalog = mobiAPI.catalogs.value.find((cat) => cat.id === formData.value.catalogId)
          if (catalog) {
            selectedCatalog.value = catalog

            // Load records
            await mobiAPI.loadRecords(
              formData.value.endpoint,
              formData.value.catalogId,
              undefined, // No type filter on initial load
              credentials,
              false,
              formData.value.allowInsecure
            )

            // Restore selected record
            if (formData.value.recordId) {
              const record = mobiAPI.records.value.find((rec) => rec.id === formData.value.recordId)
              if (record) {
                selectedRecord.value = record

                // Load branches
                await mobiAPI.loadBranches(
                  formData.value.endpoint,
                  formData.value.catalogId,
                  formData.value.recordId,
                  credentials,
                  false,
                  formData.value.allowInsecure
                )
              }
            }
          }
        }
      }
    }
  }
})

function addHeader() {
  formData.value.customHeaders = formData.value.customHeaders || []
  formData.value.customHeaders.push({ key: '', value: '' })
}

function removeHeader(index: number) {
  formData.value.customHeaders?.splice(index, 1)
}

function handleSubmit() {
  console.log('[ConnectionForm] Submitting form with data:', {
    type: formData.value.type,
    queryMode: formData.value.queryMode,
    repositoryId: formData.value.repositoryId,
    repositoryTitle: formData.value.repositoryTitle,
    recordId: formData.value.recordId,
    fullFormData: formData.value,
  })

  if (!validateForm(formData.value)) {
    console.error('[ConnectionForm] Validation failed, errors:', errors.value)
    return
  }

  console.log('[ConnectionForm] Validation passed, emitting save event')
  isSaving.value = true
  emit('save', formData.value)
}
</script>

<style scoped>
.connection-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.form-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.btn-text {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

.btn-text:hover {
  color: var(--color-text-primary);
}

form {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

input[type='text'],
input[type='url'],
input[type='password'],
textarea,
select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--color-primary);
}

input.error,
textarea.error {
  border-color: var(--color-error);
}

.error-message {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-error);
}

.custom-headers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-key {
  flex: 1;
  min-width: 120px;
}

.header-value {
  flex: 2;
}

.btn-icon-sm {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.btn-icon-sm:hover {
  background: var(--color-error);
  border-color: var(--color-error);
  color: white;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-weight: 500;
}

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  margin-top: 16px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

/* GraphStudio-specific styles */
.form-section-divider {
  height: 1px;
  background: var(--color-border);
  margin: 24px 0;
}

.graphmart-selector {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.graphmart-dropdown {
  margin-top: 8px;
}

.layer-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-left: 20px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox'] {
  width: auto;
  cursor: pointer;
}

.checkbox-label:hover {
  color: var(--color-primary);
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Mobi-specific styles */
.query-mode-selection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
}

.radio-label input[type='radio'] {
  width: auto;
  cursor: pointer;
}

.radio-label:hover {
  color: var(--color-primary);
}

.mobi-selector {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.mobi-dropdown {
  margin-top: 8px;
}

select.error {
  border-color: var(--color-error);
}
</style>
