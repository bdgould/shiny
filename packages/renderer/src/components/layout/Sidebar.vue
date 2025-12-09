<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-header">
      <h2 v-if="!isCollapsed">Connection</h2>
      <button
        class="toggle-btn"
        :title="isCollapsed ? 'Expand' : 'Collapse'"
        @click="toggleSidebar"
      >
        {{ isCollapsed ? '›' : '‹' }}
      </button>
    </div>
    <div v-if="!isCollapsed" class="sidebar-content">
      <div class="form-group">
        <label for="endpoint">Endpoint URL</label>
        <input
          id="endpoint"
          v-model="endpoint"
          type="text"
          placeholder="https://dbpedia.org/sparql"
          class="input"
        />
      </div>
      <div class="form-group">
        <label for="backend-type">Backend Type</label>
        <select id="backend-type" v-model="backendType" class="select">
          <option value="generic">Generic SPARQL 1.1</option>
          <option value="graphstudio">Altair GraphStudio</option>
          <option value="neptune">Amazon Neptune</option>
          <option value="stardog">Stardog</option>
          <option value="local">Local RDF File</option>
        </select>
      </div>
      <div class="form-group">
        <label for="auth-type">Authentication</label>
        <select id="auth-type" v-model="authType" class="select">
          <option value="none">None</option>
          <option value="basic">Basic Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="oauth">OAuth 2.0</option>
          <option value="custom">Custom Headers</option>
        </select>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isCollapsed = ref(false)
const endpoint = ref('https://dbpedia.org/sparql')
const backendType = ref('generic')
const authType = ref('none')

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<style scoped>
.sidebar {
  width: 320px;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.sidebar.collapsed {
  width: 48px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.toggle-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 1.25rem;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.sidebar-content {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.input,
.select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: 0.875rem;
}

.input:focus,
.select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-alpha);
}
</style>
