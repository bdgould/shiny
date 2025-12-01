<template>
  <div class="app">
    <TopBar />
    <div class="app-content">
      <IconSidebar />
      <MainPane />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import TopBar from './components/layout/TopBar.vue';
import IconSidebar from './components/sidebar/IconSidebar.vue';
import MainPane from './components/layout/MainPane.vue';
import { useConnectionStore } from './stores/connection';

const connectionStore = useConnectionStore();

// Load backends on app startup
onMounted(async () => {
  try {
    await connectionStore.loadBackends();
  } catch (error) {
    console.error('Failed to load backends on startup:', error);
  }
});
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
</style>
