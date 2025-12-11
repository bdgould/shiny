<template>
  <div class="settings-panel">
    <div class="panel-header">
      <h2 class="panel-title">Settings</h2>
    </div>
    <div class="settings-list">
      <button class="settings-item" @click="openQuerySettings">
        <div class="settings-item-icon">⚙️</div>
        <div class="settings-item-content">
          <div class="settings-item-title">Query Connection</div>
          <div class="settings-item-description">Connection timeouts and query execution settings</div>
        </div>
      </button>
      <button class="settings-item" @click="openAISettings">
        <div class="settings-item-icon">🤖</div>
        <div class="settings-item-content">
          <div class="settings-item-title">AI Configuration</div>
          <div class="settings-item-description">Configure OpenAI endpoints and test connections</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore } from '@/stores/tabs'
import { useSidebarStore } from '@/stores/sidebar'

const tabsStore = useTabsStore()
const sidebarStore = useSidebarStore()

function openQuerySettings() {
  // Create a new tab for query settings
  const existingTab = tabsStore.tabs.find((tab) => tab.settingsType === 'query')
  if (existingTab) {
    tabsStore.setActiveTab(existingTab.id)
  } else {
    tabsStore.createTab({
      isSettings: true,
      settingsType: 'query',
    })
  }
  // Close the drawer after opening settings
  sidebarStore.closeDrawer()
}

function openAISettings() {
  // Create a new tab for AI settings
  const existingTab = tabsStore.tabs.find((tab) => tab.settingsType === 'ai')
  if (existingTab) {
    tabsStore.setActiveTab(existingTab.id)
  } else {
    tabsStore.createTab({
      isSettings: true,
      settingsType: 'ai',
    })
  }
  // Close the drawer after opening settings
  sidebarStore.closeDrawer()
}
</script>

<style scoped>
.settings-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.settings-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.settings-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.settings-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border);
}

.settings-item-icon {
  font-size: 24px;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-item-content {
  flex: 1;
  min-width: 0;
}

.settings-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.settings-item-description {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}
</style>
