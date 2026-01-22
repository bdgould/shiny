<template>
  <div class="settings-view">
    <div class="settings-header">
      <h2>Prefix Management</h2>
      <p class="settings-description">
        Manage system-wide SPARQL prefixes that can be used in your queries. These prefixes must
        still be explicitly added to your queries to work - autocomplete functionality will be added
        in a future update.
      </p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h3>Prefix Definitions</h3>

        <div class="prefix-table">
          <div class="prefix-table-header">
            <div class="prefix-col">Prefix</div>
            <div class="namespace-col">Namespace URI</div>
            <div class="actions-col">Actions</div>
          </div>

          <div v-if="settings.prefixes.length === 0" class="empty-state">
            No prefixes defined. Add your first prefix below.
          </div>

          <div v-for="(prefix, index) in settings.prefixes" :key="index" class="prefix-row">
            <div class="prefix-col">
              <code>{{ prefix.prefix }}</code>
            </div>
            <div class="namespace-col">
              <code class="namespace-uri">{{ prefix.namespace }}</code>
            </div>
            <div class="actions-col">
              <button
                class="btn-icon btn-delete"
                title="Remove prefix"
                @click="removePrefix(index)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="add-prefix-form">
          <div class="form-row">
            <div class="form-group prefix-input">
              <label for="new-prefix">Prefix</label>
              <input
                id="new-prefix"
                v-model="newPrefix.prefix"
                type="text"
                placeholder="e.g., schema"
                @keyup.enter="addPrefix"
              />
            </div>
            <div class="form-group namespace-input">
              <label for="new-namespace">Namespace URI</label>
              <input
                id="new-namespace"
                v-model="newPrefix.namespace"
                type="text"
                placeholder="e.g., http://schema.org/"
                @keyup.enter="addPrefix"
              />
            </div>
            <div class="form-group add-button-group">
              <label>&nbsp;</label>
              <button class="btn-add" @click="addPrefix">Add Prefix</button>
            </div>
          </div>
          <span v-if="addError" class="error-text">{{ addError }}</span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Import / Export</h3>

        <div class="import-export-group">
          <div class="form-group">
            <label>Export Prefixes</label>
            <p class="help-text">Export all prefixes in Turtle format (@prefix style).</p>
            <button class="btn-secondary" @click="exportPrefixes">Export as Turtle</button>
          </div>

          <div class="form-group">
            <label for="import-text">Import Prefixes</label>
            <p class="help-text">
              Paste Turtle-style prefix definitions (@prefix) or load from a .ttl file. Existing
              prefixes with the same name will be replaced.
            </p>
            <div class="import-controls">
              <button class="btn-secondary" style="margin-bottom: 8px" @click="loadPrefixFile">
                Load from File
              </button>
            </div>
            <textarea
              id="import-text"
              v-model="importText"
              placeholder="@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .&#10;@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> ."
              rows="6"
            ></textarea>
            <button class="btn-secondary" style="margin-top: 8px" @click="importPrefixes">
              Import from Turtle
            </button>
            <span v-if="importError" class="error-text" style="margin-top: 8px">{{
              importError
            }}</span>
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
  getPrefixSettings,
  savePrefixSettings,
  type PrefixManagementSettings,
  type PrefixDefinition,
} from '@/services/preferences/appSettings'

const settings = ref<PrefixManagementSettings>({
  prefixes: [],
})

const newPrefix = ref<PrefixDefinition>({
  prefix: '',
  namespace: '',
})

const importText = ref('')
const addError = ref('')
const importError = ref('')
const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')

onMounted(() => {
  loadSettings()
})

function loadSettings() {
  settings.value = getPrefixSettings()
}

function addPrefix() {
  addError.value = ''

  // Validate inputs
  if (!newPrefix.value.prefix.trim()) {
    addError.value = 'Prefix name is required'
    return
  }

  if (!newPrefix.value.namespace.trim()) {
    addError.value = 'Namespace URI is required'
    return
  }

  // Check for duplicate prefix
  const existingIndex = settings.value.prefixes.findIndex(
    (p) => p.prefix === newPrefix.value.prefix.trim()
  )

  if (existingIndex !== -1) {
    // Replace existing prefix
    settings.value.prefixes[existingIndex] = {
      prefix: newPrefix.value.prefix.trim(),
      namespace: newPrefix.value.namespace.trim(),
    }
  } else {
    // Add new prefix
    settings.value.prefixes.push({
      prefix: newPrefix.value.prefix.trim(),
      namespace: newPrefix.value.namespace.trim(),
    })
  }

  // Clear form
  newPrefix.value.prefix = ''
  newPrefix.value.namespace = ''
}

function removePrefix(index: number) {
  settings.value.prefixes.splice(index, 1)
}

function exportPrefixes() {
  const turtleText = settings.value.prefixes
    .map((p) => `@prefix ${p.prefix}: <${p.namespace}> .`)
    .join('\n')

  // Create a blob and download
  const blob = new Blob([turtleText], { type: 'text/turtle' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'prefixes.ttl'
  a.click()
  URL.revokeObjectURL(url)

  saveMessage.value = 'Prefixes exported successfully!'
  saveMessageType.value = 'success'
  setTimeout(() => {
    saveMessage.value = ''
  }, 3000)
}

async function loadPrefixFile() {
  importError.value = ''

  try {
    const result = await window.electronAPI.files.openPrefixFile()

    if ('error' in result) {
      // User canceled or error occurred
      if (result.error !== 'No file selected') {
        importError.value = `Failed to load file: ${result.error}`
      }
      return
    }

    // Replace textarea content with file content
    importText.value = result.content

    saveMessage.value = 'File loaded successfully. Review and click "Import from Turtle" to apply.'
    saveMessageType.value = 'success'
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  } catch (error) {
    importError.value = 'Failed to load file. Please try again.'
  }
}

function importPrefixes() {
  importError.value = ''

  if (!importText.value.trim()) {
    importError.value = 'Please paste Turtle prefix definitions'
    return
  }

  try {
    // Parse Turtle-style prefix definitions
    // Match @prefix prefix: <namespace> . format
    const prefixRegex = /@prefix\s+(\S+):\s*<([^>]+)>\s*\./g
    const matches = [...importText.value.matchAll(prefixRegex)]

    if (matches.length === 0) {
      importError.value =
        'No valid prefix definitions found. Expected format: @prefix prefix: <namespace> .'
      return
    }

    // Import prefixes (replace duplicates)
    let importCount = 0
    matches.forEach((match) => {
      const prefix = match[1].trim()
      const namespace = match[2].trim()

      const existingIndex = settings.value.prefixes.findIndex((p) => p.prefix === prefix)

      if (existingIndex !== -1) {
        // Replace existing
        settings.value.prefixes[existingIndex] = { prefix, namespace }
      } else {
        // Add new
        settings.value.prefixes.push({ prefix, namespace })
      }

      importCount++
    })

    importText.value = ''
    saveMessage.value = `Successfully imported ${importCount} prefix${importCount !== 1 ? 'es' : ''}!`
    saveMessageType.value = 'success'
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  } catch (error) {
    importError.value = 'Failed to parse prefix definitions. Please check the format.'
  }
}

function saveSettings() {
  try {
    savePrefixSettings(settings.value)
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
    prefixes: [
      { prefix: 'rdf', namespace: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
      { prefix: 'rdfs', namespace: 'http://www.w3.org/2000/01/rdf-schema#' },
      { prefix: 'owl', namespace: 'http://www.w3.org/2002/07/owl#' },
      { prefix: 'xsd', namespace: 'http://www.w3.org/2001/XMLSchema#' },
      { prefix: 'skos', namespace: 'http://www.w3.org/2004/02/skos/core#' },
      { prefix: 'dcterms', namespace: 'http://purl.org/dc/terms/' },
      { prefix: 'foaf', namespace: 'http://xmlns.com/foaf/0.1/' },
    ],
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

/* Prefix Table */
.prefix-table {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.prefix-table-header {
  display: flex;
  background: var(--color-bg-header);
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-secondary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
}

.prefix-row {
  display: flex;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  transition: background-color 0.15s ease;
}

.prefix-row:last-child {
  border-bottom: none;
}

.prefix-row:hover {
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.02));
}

.prefix-col {
  flex: 0 0 150px;
  display: flex;
  align-items: center;
}

.namespace-col {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.namespace-uri {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-col {
  flex: 0 0 60px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

code {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  color: var(--color-text-primary);
  background: var(--color-bg-code, rgba(0, 0, 0, 0.05));
  padding: 2px 6px;
  border-radius: 3px;
}

/* Add Prefix Form */
.add-prefix-form {
  margin-top: 16px;
  padding: 16px;
  background: var(--color-bg-header);
  border-radius: 4px;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.form-group {
  margin-bottom: 0;
}

.prefix-input {
  flex: 0 0 200px;
}

.namespace-input {
  flex: 1;
  min-width: 0;
}

.add-button-group {
  flex: 0 0 auto;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-group input,
.form-group textarea {
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

.form-group textarea {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  resize: vertical;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.help-text {
  display: block;
  margin-top: 4px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.error-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-error);
  line-height: 1.4;
}

/* Import/Export Group */
.import-export-group {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-add {
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

.btn-secondary,
.btn-add {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover,
.btn-add:hover {
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.05));
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 20px;
  line-height: 1;
  color: var(--color-text-secondary);
  border-radius: 3px;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.05));
}

.btn-delete:hover {
  color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
}

.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--color-border);
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

@media (prefers-color-scheme: dark) {
  code {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
