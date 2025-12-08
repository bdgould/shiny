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
          <input
            type="checkbox"
            v-model="formData.allowInsecure"
          />
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
            <div
              v-for="(header, index) in formData.customHeaders"
              :key="index"
              class="header-row"
            >
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
                @click="removeHeader(index)"
                title="Remove header"
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
              @click="loadGraphmartsFromServer"
              :disabled="!canLoadGraphmarts || graphstudioAPI.isLoading.value"
            >
              {{ graphstudioAPI.isLoading.value ? 'Loading...' : 'Load Graphmarts' }}
            </button>

            <button
              v-if="graphstudioAPI.hasGraphmarts.value"
              type="button"
              class="btn-icon-sm"
              @click="refreshGraphmarts"
              title="Refresh graphmart list"
            >
              🔄
            </button>
          </div>

          <select
            v-if="graphstudioAPI.hasGraphmarts.value"
            v-model="formData.graphmartUri"
            @change="onGraphmartSelected"
            :class="{ error: errors.graphmart }"
            class="graphmart-dropdown"
          >
            <option value="">Select a graphmart...</option>
            <option
              v-for="gm in graphstudioAPI.graphmarts.value"
              :key="gm.uri"
              :value="gm.uri"
            >
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
              <input
                type="checkbox"
                v-model="useAllLayers"
                @change="onAllLayersToggle"
              />
              <span>All Layers (default)</span>
            </label>

            <div v-if="!useAllLayers && selectedGraphmart.layers.length > 0" class="layer-list">
              <label
                v-for="layer in selectedGraphmart.layers"
                :key="layer.uri"
                class="checkbox-label"
              >
                <input
                  type="checkbox"
                  :value="layer.uri"
                  v-model="formData.selectedLayers"
                />
                <span>{{ layer.name }}</span>
              </label>
            </div>

            <p v-if="!useAllLayers && selectedGraphmart.layers.length === 0" class="hint-text">
              No layers available for this graphmart
            </p>
          </div>
        </div>
      </template>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="$emit('cancel')">
          Cancel
        </button>
        <button type="submit" class="btn-primary" :disabled="isSaving">
          {{ isSaving ? 'Saving...' : (isEditing ? 'Update' : 'Create') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { BackendConfig } from '@/types/backends';
import type { Graphmart } from '@/types/electron';
import { useBackendValidation, type BackendFormData } from '@/composables/useBackendValidation';
import { useGraphStudioAPI } from '@/composables/useGraphStudioAPI';

interface Props {
  backend?: BackendConfig;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  save: [data: BackendFormData];
  cancel: [];
}>();

const isEditing = !!props.backend;
const isSaving = ref(false);

// GraphStudio API composable
const graphstudioAPI = useGraphStudioAPI();

// GraphStudio state
const useAllLayers = ref(true);
const selectedGraphmart = ref<Graphmart | null>(null);

// Parse existing provider config if editing GraphStudio backend
let initialGraphmartUri = '';
let initialGraphmartName = '';
let initialSelectedLayers: string[] = [];

if (props.backend && props.backend.type === 'graphstudio' && props.backend.providerConfig) {
  try {
    const providerConfig = JSON.parse(props.backend.providerConfig);
    initialGraphmartUri = providerConfig.graphmartUri || '';
    initialGraphmartName = providerConfig.graphmartName || '';
    initialSelectedLayers = providerConfig.selectedLayers || [];
    useAllLayers.value = initialSelectedLayers.length === 0 || initialSelectedLayers.includes('ALL_LAYERS');
  } catch (e) {
    console.error('Failed to parse provider config:', e);
  }
}

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
});

const { errors, validateForm, clearErrors } = useBackendValidation();

// Clear credentials when auth type changes
watch(() => formData.value.authType, () => {
  formData.value.username = '';
  formData.value.password = '';
  formData.value.token = '';
  formData.value.customHeaders = [{ key: '', value: '' }];
  clearErrors();
});

// Watch for backend type changes
watch(() => formData.value.type, (newType) => {
  // Clear GraphStudio-specific fields when switching away
  if (newType !== 'graphstudio') {
    formData.value.graphmartUri = '';
    formData.value.graphmartName = '';
    formData.value.selectedLayers = [];
    selectedGraphmart.value = null;
  }
});

// Computed: Can load graphmarts (need endpoint and optional credentials)
const canLoadGraphmarts = computed(() => {
  if (!formData.value.endpoint) return false;

  // If Basic Auth selected, require credentials
  if (formData.value.authType === 'basic') {
    return !!formData.value.username && !!formData.value.password;
  }

  return true;
});

// GraphStudio: Load graphmarts from server
async function loadGraphmartsFromServer() {
  if (!canLoadGraphmarts.value) return;

  const credentials = formData.value.authType === 'basic'
    ? { username: formData.value.username, password: formData.value.password }
    : undefined;

  await graphstudioAPI.loadGraphmarts(formData.value.endpoint, credentials, false, formData.value.allowInsecure);
}

// GraphStudio: Refresh graphmarts
async function refreshGraphmarts() {
  if (!canLoadGraphmarts.value) return;

  const credentials = formData.value.authType === 'basic'
    ? { username: formData.value.username, password: formData.value.password }
    : undefined;

  await graphstudioAPI.refreshGraphmarts(formData.value.endpoint, credentials, formData.value.allowInsecure);
}

// GraphStudio: Get status icon for graphmart
function getGraphmartStatusIcon(status: 'active' | 'inactive' | 'error'): string {
  switch (status) {
    case 'active':
      return '●';
    case 'inactive':
      return '○';
    case 'error':
      return '⚠';
    default:
      return '○';
  }
}

// GraphStudio: When graphmart is selected
function onGraphmartSelected() {
  const graphmart = graphstudioAPI.graphmarts.value.find(
    gm => gm.uri === formData.value.graphmartUri
  );

  if (graphmart) {
    selectedGraphmart.value = graphmart;
    formData.value.graphmartName = graphmart.name;

    // Reset layer selection
    useAllLayers.value = true;
    formData.value.selectedLayers = ['ALL_LAYERS'];
  } else {
    selectedGraphmart.value = null;
    formData.value.graphmartName = '';
  }
}

// GraphStudio: Toggle all layers checkbox
function onAllLayersToggle() {
  if (useAllLayers.value) {
    formData.value.selectedLayers = ['ALL_LAYERS'];
  } else {
    formData.value.selectedLayers = [];
  }
}

// Load existing credentials when editing
async function loadExistingCredentials() {
  if (!isEditing || !props.backend) return;

  try {
    const credentials = await window.electronAPI.backends.getCredentials(props.backend.id);

    if (credentials) {
      // Populate form with existing credentials
      if (credentials.username) formData.value.username = credentials.username;
      if (credentials.password) formData.value.password = credentials.password;
      if (credentials.token) formData.value.token = credentials.token;
      if (credentials.headers) {
        formData.value.customHeaders = Object.entries(credentials.headers).map(([key, value]) => ({
          key,
          value,
        }));
      }
    }
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}

// Auto-load credentials and graphmarts when editing
onMounted(async () => {
  // Load credentials first
  await loadExistingCredentials();

  // Then load graphmarts for GraphStudio backends
  if (isEditing && formData.value.type === 'graphstudio' && formData.value.endpoint) {
    const credentials = formData.value.authType === 'basic'
      ? { username: formData.value.username, password: formData.value.password }
      : undefined;

    await graphstudioAPI.loadGraphmarts(formData.value.endpoint, credentials, false, formData.value.allowInsecure);

    // Restore selected graphmart if it exists in the list
    if (formData.value.graphmartUri) {
      const graphmart = graphstudioAPI.graphmarts.value.find(
        gm => gm.uri === formData.value.graphmartUri
      );
      if (graphmart) {
        selectedGraphmart.value = graphmart;
      }
    }
  }
});

function addHeader() {
  formData.value.customHeaders = formData.value.customHeaders || [];
  formData.value.customHeaders.push({ key: '', value: '' });
}

function removeHeader(index: number) {
  formData.value.customHeaders?.splice(index, 1);
}

function handleSubmit() {
  if (!validateForm(formData.value)) {
    return;
  }

  isSaving.value = true;
  emit('save', formData.value);
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

input[type="text"],
input[type="url"],
input[type="password"],
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

.checkbox-label input[type="checkbox"] {
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
</style>
