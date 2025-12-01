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
import { ref, watch } from 'vue';
import type { BackendConfig } from '@/types/backends';
import { useBackendValidation, type BackendFormData } from '@/composables/useBackendValidation';

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

// Initialize form data
const formData = ref<BackendFormData>({
  name: props.backend?.name || '',
  type: (props.backend?.type as any) || 'sparql-1.1',
  endpoint: props.backend?.endpoint || '',
  authType: (props.backend?.authType as any) || 'none',
  username: '',
  password: '',
  token: '',
  customHeaders: [{ key: '', value: '' }],
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
</style>
