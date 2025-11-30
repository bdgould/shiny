<template>
  <div class="app">
    <TopBar />
    <div class="app-content">
      <Sidebar />
      <MainPane />
    </div>
  </div>
</template>

<script setup lang="ts">
import TopBar from './components/layout/TopBar.vue';
import Sidebar from './components/layout/Sidebar.vue';
import MainPane from './components/layout/MainPane.vue';
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
