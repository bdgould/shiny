<template>
  <div class="settings-view">
    <div class="settings-header">
      <h2>Query Connection Settings</h2>
      <p class="settings-description">
        Configure connection timeouts and query execution parameters. These settings will be applied to all
        backend connections.
      </p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h3>Connection</h3>

        <div class="form-group">
          <label for="connection-timeout">Connection Timeout</label>
          <div class="input-with-unit">
            <input
              id="connection-timeout"
              v-model.number="settings.connectionTimeout"
              type="number"
              min="1000"
              max="300000"
              step="1000"
            />
            <span class="unit">ms</span>
          </div>
          <span class="help-text">Maximum time to wait for initial connection (1-300 seconds)</span>
        </div>

        <div class="form-group">
          <label for="query-timeout">Query Timeout</label>
          <div class="input-with-unit">
            <input
              id="query-timeout"
              v-model.number="settings.queryTimeout"
              type="number"
              min="1000"
              max="3600000"
              step="1000"
            />
            <span class="unit">ms</span>
          </div>
          <span class="help-text">Maximum time to wait for query execution (1-3600 seconds)</span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Retry Configuration</h3>

        <div class="form-group">
          <label for="max-retries">Maximum Retries</label>
          <input id="max-retries" v-model.number="settings.maxRetries" type="number" min="0" max="10" step="1" />
          <span class="help-text">Number of retry attempts for failed queries (0-10)</span>
        </div>

        <div class="form-group">
          <label for="retry-delay">Retry Delay</label>
          <div class="input-with-unit">
            <input
              id="retry-delay"
              v-model.number="settings.retryDelay"
              type="number"
              min="100"
              max="60000"
              step="100"
            />
            <span class="unit">ms</span>
          </div>
          <span class="help-text">Delay between retry attempts (100-60000 ms)</span>
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
import { getQuerySettings, saveQuerySettings, type QueryConnectionSettings } from '@/services/preferences/appSettings'

const settings = ref<QueryConnectionSettings>({
  connectionTimeout: 30000,
  queryTimeout: 300000,
  maxRetries: 3,
  retryDelay: 1000,
})

const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')

onMounted(() => {
  loadSettings()
})

function loadSettings() {
  settings.value = getQuerySettings()
}

function saveSettings() {
  try {
    saveQuerySettings(settings.value)
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
    connectionTimeout: 30000,
    queryTimeout: 300000,
    maxRetries: 3,
    retryDelay: 1000,
  }
  saveMessage.value = 'Reset to default values. Click Save to apply.'
  saveMessageType.value = 'success'
  setTimeout(() => {
    saveMessage.value = ''
  }, 3000)
}
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-header);
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
}

.help-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
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
