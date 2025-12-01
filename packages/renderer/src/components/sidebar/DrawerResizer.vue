<template>
  <div
    class="drawer-resizer"
    @mousedown="startResize"
  ></div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { useSidebarStore } from '@/stores/sidebar';

const sidebarStore = useSidebarStore();
const isResizing = ref(false);

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

function startResize(event: MouseEvent) {
  event.preventDefault();
  isResizing.value = true;

  const startX = event.clientX;
  const startWidth = sidebarStore.drawerWidth;

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value) return;

    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;

    // Clamp to min/max bounds
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    sidebarStore.setDrawerWidth(clampedWidth);
  }

  function handleMouseUp() {
    isResizing.value = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

// Cleanup on unmount
onBeforeUnmount(() => {
  if (isResizing.value) {
    isResizing.value = false;
  }
});
</script>

<style scoped>
.drawer-resizer {
  width: 4px;
  height: 100%;
  background: transparent;
  cursor: col-resize;
  position: relative;
  flex-shrink: 0;
}

.drawer-resizer:hover {
  background: var(--color-primary-alpha);
}

.drawer-resizer::before {
  content: '';
  position: absolute;
  left: -2px;
  right: -2px;
  top: 0;
  bottom: 0;
}
</style>
