<template>
  <div class="settings-view">
    <div class="settings-header">
      <h2>AI Configuration</h2>
      <p class="settings-description">
        Configure OpenAI-compatible endpoints for AI features. Enter your API credentials and test the connection.
      </p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h3>Endpoint Configuration</h3>

        <div class="form-group">
          <label for="ai-endpoint">API Base URL</label>
          <input
            id="ai-endpoint"
            v-model="settings.endpoint"
            type="url"
            placeholder="https://api.openai.com/v1"
          />
          <span class="help-text">Base URL for OpenAI-compatible API (without /chat/completions)</span>
        </div>

        <div class="form-group">
          <label for="ai-api-key">API Key</label>
          <div class="password-input">
            <input
              id="ai-api-key"
              v-model="settings.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk-..."
              autocomplete="off"
            />
            <button type="button" class="btn-toggle-visibility" @click="showApiKey = !showApiKey">
              {{ showApiKey ? '🙈' : '👁️' }}
            </button>
          </div>
          <span class="help-text">Your API key will be stored in browser local storage</span>
        </div>

        <div class="form-group">
          <label for="ai-model">Model</label>
          <div class="model-input-container">
            <div class="model-input-group">
              <select
                v-if="!useCustomModel && availableModels.length > 0"
                id="ai-model"
                v-model="settings.model"
                class="model-select"
              >
                <option value="" disabled>Select a model...</option>
                <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
              </select>
              <input
                v-else
                id="ai-model"
                v-model="settings.model"
                type="text"
                placeholder="gpt-3.5-turbo"
              />
              <button
                type="button"
                class="btn-fetch-models"
                :disabled="isFetchingModels || !settings.endpoint || !settings.apiKey"
                @click="fetchModels"
              >
                {{ isFetchingModels ? 'Fetching...' : 'Fetch Models' }}
              </button>
            </div>
            <label v-if="availableModels.length > 0" class="checkbox-label">
              <input v-model="useCustomModel" type="checkbox" />
              <span>Use custom model name</span>
            </label>
          </div>
          <span v-if="modelWarning" class="help-text warning">⚠️ {{ modelWarning }}</span>
          <span v-else class="help-text">
            {{ availableModels.length > 0 ? 'Select a model or enter a custom one' : 'Click "Fetch Models" to load available models, or type your own' }}
          </span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Advanced Options</h3>

        <div class="form-group">
          <label for="ai-temperature">Temperature</label>
          <div class="input-with-unit">
            <input
              id="ai-temperature"
              v-model.number="settings.temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
            />
            <span class="unit">{{ settings.temperature }}</span>
          </div>
          <span class="help-text">Controls randomness (0.0 = deterministic, 2.0 = very random)</span>
        </div>

        <div class="form-group">
          <label for="ai-max-tokens">Max Tokens</label>
          <input
            id="ai-max-tokens"
            v-model.number="settings.maxTokens"
            type="number"
            min="1"
            max="32000"
            step="1"
          />
          <span class="help-text">Maximum number of tokens in the response</span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Test Connection</h3>
        <p class="help-text">Send a test request to verify your configuration</p>

        <button class="btn-test" :disabled="isTesting || !settings.apiKey" @click="testConnection">
          {{ isTesting ? 'Testing...' : 'Test Endpoint' }}
        </button>

        <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
          <div class="test-result-header">
            {{ testResult.success ? '✅ Connection successful!' : '❌ Connection failed' }}
          </div>
          <div v-if="testResult.url" class="test-result-content">
            <strong>URL:</strong>
            <p class="url-text">{{ testResult.url }}</p>
          </div>
          <div v-if="testResult.response" class="test-result-content">
            <strong>Response:</strong>
            <p>{{ testResult.response }}</p>
          </div>
          <div v-if="testResult.error" class="test-result-content">
            <strong>Error:</strong>
            <p>{{ testResult.error }}</p>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button class="btn-secondary" @click="resetToDefaults">Reset to Defaults</button>
        <button class="btn-primary" @click="saveSettings">Save Settings</button>
      </div>

      <div v-if="saveMessage" class="save-message" :class="saveMessageType">
        {{ saveMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getAISettings,
  saveAISettings,
  testAIConnection,
  fetchAIModels,
  type AIConnectionSettings,
} from '@/services/preferences/appSettings'

const settings = ref<AIConnectionSettings>({
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 1000,
})

const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')
const showApiKey = ref(false)
const isTesting = ref(false)
const isFetchingModels = ref(false)
const availableModels = ref<string[]>([])
const useCustomModel = ref(false)
const modelWarning = ref('')
const testResult = ref<{ success: boolean; response?: string; error?: string; url?: string } | null>(null)

onMounted(() => {
  loadSettings()
})

function loadSettings() {
  settings.value = getAISettings()
}

function saveSettings() {
  try {
    saveAISettings(settings.value)
    saveMessage.value = 'Settings saved successfully!'
    saveMessageType.value = 'success'
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  } catch (error) {
    saveMessage.value = 'Failed to save settings'
    saveMessageType.value = 'error'
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
}

function resetToDefaults() {
  settings.value = {
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 1000,
  }
  testResult.value = null
  availableModels.value = []
  useCustomModel.value = false
  modelWarning.value = ''
  saveMessage.value = 'Reset to default values. Click Save to apply.'
  saveMessageType.value = 'success'
  setTimeout(() => {
    saveMessage.value = ''
  }, 3000)
}

async function fetchModels() {
  if (!settings.value.endpoint || !settings.value.apiKey) {
    return
  }

  isFetchingModels.value = true
  modelWarning.value = ''

  try {
    const result = await fetchAIModels(settings.value.endpoint, settings.value.apiKey)
    if (result.success && result.models) {
      availableModels.value = result.models
      useCustomModel.value = false // Switch to select mode when models are fetched
      checkModelInList()
      if (result.models.length === 0) {
        modelWarning.value = 'No models returned from the endpoint'
      }
    } else {
      modelWarning.value = result.error || 'Failed to fetch models'
    }
  } catch (error) {
    modelWarning.value = error instanceof Error ? error.message : 'Failed to fetch models'
  } finally {
    isFetchingModels.value = false
  }
}

function checkModelInList() {
  if (availableModels.value.length === 0) {
    modelWarning.value = ''
    return
  }

  if (!settings.value.model) {
    modelWarning.value = ''
    return
  }

  if (!availableModels.value.includes(settings.value.model)) {
    modelWarning.value = `Model "${settings.value.model}" not found in available models list`
  } else {
    modelWarning.value = ''
  }
}

async function testConnection() {
  if (!settings.value.apiKey) {
    testResult.value = {
      success: false,
      error: 'API key is required',
    }
    return
  }

  isTesting.value = true
  testResult.value = null

  try {
    const result = await testAIConnection(settings.value)
    testResult.value = result
  } catch (error) {
    testResult.value = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  } finally {
    isTesting.value = false
  }
}
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
  background: var(--color-bg-header);
  flex-shrink: 0;
}

.settings-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
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
  background: var(--color-bg-main);
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.password-input {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input input {
  padding-right: 40px;
}

.btn-toggle-visibility {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

.btn-toggle-visibility:hover {
  opacity: 1;
}

.input-with-unit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-unit input {
  flex: 0 0 200px;
}

.unit {
  font-size: 14px;
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: 40px;
}

.help-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.help-text.warning {
  color: var(--color-warning);
}

.model-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-input-group {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.model-input-group input,
.model-input-group select {
  flex: 1;
}

.model-select {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.model-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox'] {
  width: auto;
  cursor: pointer;
}

.checkbox-label span {
  cursor: pointer;
}

.btn-fetch-models {
  padding: 8px 16px;
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-fetch-models:hover:not(:disabled) {
  background: var(--color-bg-input);
  border-color: var(--color-primary);
}

.btn-fetch-models:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-test {
  padding: 10px 20px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 12px;
}

.btn-test:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-result {
  margin-top: 16px;
  padding: 16px;
  border-radius: 6px;
  font-size: 14px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.test-result-header {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--color-text-primary);
}

.test-result-content {
  margin-top: 8px;
}

.test-result-content strong {
  display: block;
  margin-bottom: 4px;
  color: var(--color-text-primary);
}

.test-result-content p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.url-text {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  background: var(--color-bg-input);
  padding: 4px 8px;
  border-radius: 3px;
  word-break: break-all;
}

.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border);
}

.btn-primary,
.btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

.save-message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.save-message.success {
  background: rgba(34, 197, 94, 0.1);
  color: rgb(34, 197, 94);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.save-message.error {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(239, 68, 68);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
</style>
