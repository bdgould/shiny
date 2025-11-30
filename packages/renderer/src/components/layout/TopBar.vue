<template>
  <header class="top-bar">
    <div class="logo">
      <h1><img src="@/assets/images/shiny.png" alt="Shiny Logo" height="32" /> Shiny</h1>
      <span class="subtitle">SPARQL Client</span>
    </div>
    <div class="actions">
      <!-- Theme toggle and other actions will go here -->
    </div>
  </header>
</template>

<script setup lang="ts">
</script>

<style scoped>
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--color-bg-header);
  border-bottom: 1px solid var(--color-border);
  height: 60px;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.logo h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.logo img {
  vertical-align: middle;
  width: 75px;
  height: auto;
}

.subtitle {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.actions {
  display: flex;
  gap: 0.5rem;
}
</style>
