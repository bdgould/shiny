<template>
  <div class="settings-view">
    <div class="settings-header">
      <h2>SPARQL Formatting Settings</h2>
      <p class="settings-description">
        Configure formatting preferences for SPARQL queries. These settings will be applied when you
        format a query using Edit → Format Query (Ctrl+Shift+F / Cmd+Shift+F).
      </p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h3>Indentation</h3>

        <div class="form-group">
          <label for="indent-size">Indent Size</label>
          <div class="input-with-unit">
            <input
              id="indent-size"
              v-model.number="settings.indentSize"
              type="number"
              min="1"
              max="8"
              step="1"
            />
            <span class="unit">spaces</span>
          </div>
          <span class="help-text">Number of spaces for each indentation level (1-8)</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.useTabs" type="checkbox" />
            <span>Use tabs instead of spaces</span>
          </label>
          <span class="help-text"
            >When enabled, tabs will be used for indentation instead of spaces</span
          >
        </div>
      </div>

      <div class="settings-section">
        <h3>Keywords & Alignment</h3>

        <div class="form-group">
          <label for="keyword-case">Keyword Case</label>
          <select id="keyword-case" v-model="settings.keywordCase">
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
          </select>
          <span class="help-text">Case style for SPARQL keywords (SELECT, WHERE, etc.)</span>
        </div>

        <div class="form-group">
          <label for="brace-style">Opening Brace Style</label>
          <select id="brace-style" v-model="settings.braceStyle">
            <option value="same-line">Same Line (CONSTRUCT {)</option>
            <option value="new-line">New Line (CONSTRUCT\n{)</option>
          </select>
          <span class="help-text">Placement of opening braces after keywords</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.alignPrefixes" type="checkbox" />
            <span>Align PREFIX declarations</span>
          </label>
          <span class="help-text">Align namespace IRIs in PREFIX statements for readability</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.alignPredicates" type="checkbox" />
            <span>Align predicates in triple patterns</span>
          </label>
          <span class="help-text">Align predicates and objects in triple patterns</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.useRdfTypeShorthand" type="checkbox" />
            <span>Use 'a' shortcut for rdf:type</span>
          </label>
          <span class="help-text"
            >Use 'a' instead of rdf:type or full IRI (&lt;http://...#type&gt;)</span
          >
        </div>
      </div>

      <div class="settings-section">
        <h3>Spacing</h3>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.insertSpaces.afterCommas" type="checkbox" />
            <span>Space after commas</span>
          </label>
          <span class="help-text">Insert space after commas in value lists</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.insertSpaces.beforeBraces" type="checkbox" />
            <span>Space before opening braces</span>
          </label>
          <span class="help-text">Insert space before opening curly braces</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.insertSpaces.afterBraces" type="checkbox" />
            <span>Space after opening braces</span>
          </label>
          <span class="help-text">Insert space after opening curly braces</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.insertSpaces.beforeParentheses" type="checkbox" />
            <span>Space before opening parentheses</span>
          </label>
          <span class="help-text">Insert space before opening parentheses in function calls</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.insertSpaces.beforeStatementSeparators" type="checkbox" />
            <span>Space before statement separators</span>
          </label>
          <span class="help-text"
            >Insert space before . and ; separators (?s ?p ?o . vs ?s ?p ?o.)</span
          >
        </div>
      </div>

      <div class="settings-section">
        <h3>Line Breaks</h3>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.lineBreaks.afterPrefix" type="checkbox" />
            <span>Line break after each PREFIX</span>
          </label>
          <span class="help-text">Place each PREFIX declaration on its own line</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.lineBreaks.betweenPrefixAndQuery" type="checkbox" />
            <span>Blank line between PREFIXes and query</span>
          </label>
          <span class="help-text"
            >Insert blank line after PREFIX declarations and before the query</span
          >
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.lineBreaks.afterSelect" type="checkbox" />
            <span>Line break after SELECT clause</span>
          </label>
          <span class="help-text">Add line break after SELECT clause variables</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.lineBreaks.afterWhere" type="checkbox" />
            <span>Line break after WHERE clause</span>
          </label>
          <span class="help-text">Add line break after WHERE keyword</span>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input v-model="settings.lineBreaks.betweenClauses" type="checkbox" />
            <span>Blank line between clauses</span>
          </label>
          <span class="help-text"
            >Insert blank line between major query clauses (WHERE, OPTIONAL, FILTER, etc.)</span
          >
        </div>
      </div>

      <div class="settings-section">
        <h3>Line Length</h3>

        <div class="form-group">
          <label for="max-line-length">Maximum Line Length</label>
          <div class="input-with-unit">
            <input
              id="max-line-length"
              v-model.number="settings.maxLineLength"
              type="number"
              min="40"
              max="200"
              step="10"
            />
            <span class="unit">characters</span>
          </div>
          <span class="help-text"
            >Preferred maximum line length before wrapping (40-200 characters)</span
          >
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
  getSparqlFormattingSettings,
  saveSparqlFormattingSettings,
  type SparqlFormattingSettings,
} from '@/services/preferences/appSettings'

const settings = ref<SparqlFormattingSettings>({
  indentSize: 2,
  useTabs: false,
  keywordCase: 'uppercase',
  alignPrefixes: true,
  alignPredicates: false,
  useRdfTypeShorthand: true,
  braceStyle: 'same-line',
  insertSpaces: {
    afterCommas: true,
    beforeBraces: true,
    afterBraces: true,
    beforeParentheses: false,
    beforeStatementSeparators: false,
  },
  lineBreaks: {
    afterPrefix: true,
    afterSelect: true,
    afterWhere: true,
    betweenClauses: false,
    betweenPrefixAndQuery: true,
  },
  maxLineLength: 120,
})

const saveMessage = ref('')
const saveMessageType = ref<'success' | 'error'>('success')

onMounted(() => {
  loadSettings()
})

function loadSettings() {
  settings.value = getSparqlFormattingSettings()
}

function saveSettings() {
  try {
    saveSparqlFormattingSettings(settings.value)
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
    indentSize: 2,
    useTabs: false,
    keywordCase: 'uppercase',
    alignPrefixes: true,
    alignPredicates: false,
    useRdfTypeShorthand: true,
    braceStyle: 'same-line',
    insertSpaces: {
      afterCommas: true,
      beforeBraces: true,
      afterBraces: true,
      beforeParentheses: false,
      beforeStatementSeparators: false,
    },
    lineBreaks: {
      afterPrefix: true,
      afterSelect: true,
      afterWhere: true,
      betweenClauses: false,
      betweenPrefixAndQuery: true,
    },
    maxLineLength: 120,
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
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.15s ease;
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
