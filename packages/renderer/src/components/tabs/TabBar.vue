<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <button
        v-for="tab in tabsStore.tabs"
        :key="tab.id"
        @click="tabsStore.setActiveTab(tab.id)"
        @mousedown.middle.prevent="handleMiddleClick(tab.id)"
        :class="{ active: tab.id === tabsStore.activeTabId }"
        class="tab"
        :title="getTabTooltip(tab)"
      >
        <span class="tab-name">{{ tab.name }}</span>
        <span v-if="tab.isDirty" class="dirty-indicator">●</span>
        <span v-if="tab.isExecuting" class="executing-indicator">
          <svg class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
          </svg>
        </span>
        <span
          @click.stop="handleCloseTab(tab.id)"
          class="tab-close"
          :title="`Close ${tab.name}`"
          role="button"
          tabindex="0"
          @keydown.enter.stop="handleCloseTab(tab.id)"
          @keydown.space.stop="handleCloseTab(tab.id)"
        >
          ×
        </span>
      </button>
    </div>
    <button
      @click="tabsStore.createTab()"
      class="tab-new"
      title="New Query (Ctrl/Cmd+T)"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore } from '@/stores/tabs';
import type { Tab } from '@/stores/tabs';

const tabsStore = useTabsStore();

function handleMiddleClick(tabId: string) {
  handleCloseTab(tabId);
}

async function handleCloseTab(tabId: string) {
  const tab = tabsStore.getTab(tabId);
  if (!tab) return;

  // TODO: In Phase 9, add unsaved changes warning here
  if (tab.isDirty) {
    const confirmed = confirm(`"${tab.name}" has unsaved changes. Do you want to close it anyway?`);
    if (!confirmed) return;
  }

  tabsStore.closeTab(tabId);
}

function getTabTooltip(tab: Tab): string {
  if (tab.filePath) {
    return tab.filePath;
  }
  return tab.name;
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  height: 36px;
  overflow: hidden;
}

.tabs-container {
  display: flex;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.tabs-container::-webkit-scrollbar {
  height: 4px;
}

.tabs-container::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--color-bg-header);
  border: none;
  border-right: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.8125rem;
  white-space: nowrap;
  min-width: 120px;
  max-width: 200px;
  transition: background-color 0.15s, color 0.15s;
  position: relative;
}

.tab:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tab.active {
  background: var(--color-bg-main);
  color: var(--color-text-primary);
  border-bottom: 2px solid var(--color-primary);
  padding-bottom: 6px;
}

.tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dirty-indicator {
  color: var(--color-primary);
  font-size: 1rem;
  line-height: 1;
  flex-shrink: 0;
}

.executing-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.spinner {
  width: 100%;
  height: 100%;
  animation: spin 1s linear infinite;
}

.spinner circle {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 3;
  stroke-dasharray: 50;
  stroke-dashoffset: 25;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.tab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--color-bg-header);
  border: none;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
  flex-shrink: 0;
  transition: background-color 0.15s, color 0.15s;
}

.tab-new:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
</style>
