<template>
  <div class="sidebar-icon-bar">
    <button
      class="icon-button"
      :class="{ active: sidebarStore.activePanel === 'connection' }"
      title="Connections"
      @click="sidebarStore.togglePanel('connection')"
    >
      <ConnectionIcon />
    </button>

    <button
      class="icon-button"
      :class="{ active: sidebarStore.activePanel === 'ai' }"
      title="AI Support Agent"
      @click="sidebarStore.togglePanel('ai')"
    >
      <AIIcon />
    </button>

    <button
      class="icon-button"
      :class="{ active: sidebarStore.activePanel === 'history' }"
      title="Query History"
      @click="sidebarStore.togglePanel('history')"
    >
      <HistoryIcon />
    </button>

    <div class="spacer"></div>

    <button
      class="icon-button"
      :class="{ active: sidebarStore.activePanel === 'settings' }"
      title="Settings"
      @click="sidebarStore.togglePanel('settings')"
    >
      <SettingsIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useSidebarStore } from '@/stores/sidebar'
import ConnectionIcon from './icons/ConnectionIcon.vue'
import AIIcon from './icons/AIIcon.vue'
import HistoryIcon from './icons/HistoryIcon.vue'
import SettingsIcon from './icons/SettingsIcon.vue'

const sidebarStore = useSidebarStore()
</script>

<style scoped>
.sidebar-icon-bar {
  width: var(--sidebar-icon-bar-width);
  height: 100%;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.icon-button {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.icon-button:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.icon-button.active {
  background: var(--color-primary-alpha);
  color: var(--color-primary);
}

.icon-button.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

.spacer {
  flex: 1;
}
</style>
