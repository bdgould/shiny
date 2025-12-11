<template>
  <Transition name="drawer-slide">
    <div
      v-if="sidebarStore.isDrawerOpen"
      class="sidebar-drawer"
      :style="{ width: `${sidebarStore.drawerWidth}px` }"
    >
      <div class="drawer-content">
        <ConnectionPanel v-if="sidebarStore.activePanel === 'connection'" />
        <AIPanel v-else-if="sidebarStore.activePanel === 'ai'" />
        <HistoryPanel v-else-if="sidebarStore.activePanel === 'history'" />
        <SettingsPanel v-else-if="sidebarStore.activePanel === 'settings'" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useSidebarStore } from '@/stores/sidebar'
import ConnectionPanel from './panels/ConnectionPanel.vue'
import AIPanel from './panels/AIPanel.vue'
import HistoryPanel from './panels/HistoryPanel.vue'
import SettingsPanel from './panels/SettingsPanel.vue'

const sidebarStore = useSidebarStore()
</script>

<style scoped>
.sidebar-drawer {
  height: 100%;
  background: var(--color-bg-sidebar);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--color-bg-sidebar);
}

/* Slide-in/out animation - width-based for smoother transition */
.drawer-slide-enter-active {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.drawer-slide-leave-active {
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  width: 0 !important;
  border-right-width: 0;
}
</style>
