<template>
  <div class="icon-sidebar">
    <SidebarIconBar />
    <SidebarDrawer />
    <DrawerResizer v-if="sidebarStore.isDrawerOpen" />
  </div>
</template>

<script setup lang="ts">
import { useSidebarStore } from '@/stores/sidebar'
import SidebarIconBar from './SidebarIconBar.vue'
import SidebarDrawer from './SidebarDrawer.vue'
import DrawerResizer from './DrawerResizer.vue'

const sidebarStore = useSidebarStore()
</script>

<style scoped>
.icon-sidebar {
  height: 100%;
  display: flex;
  flex-direction: row;
  background: var(--color-bg-sidebar);
}
</style>
