<template>
  <div class="connection-panel">
    <BackendList
      v-if="!showForm"
      @add="handleAdd"
      @edit="handleEdit"
    />
    <ConnectionForm
      v-else
      :backend="editingBackend"
      @save="handleSave"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useConnectionStore } from '@/stores/connection';
import BackendList from './BackendList.vue';
import ConnectionForm from './ConnectionForm.vue';
import type { BackendConfig } from '@/types/backends';
import type { BackendFormData } from '@/composables/useBackendValidation';

const connectionStore = useConnectionStore();

const showForm = ref(false);
const editingBackend = ref<BackendConfig | undefined>(undefined);

function handleAdd() {
  editingBackend.value = undefined;
  showForm.value = true;
}

function handleEdit(backend: BackendConfig) {
  editingBackend.value = backend;
  showForm.value = true;
}

function handleCancel() {
  showForm.value = false;
  editingBackend.value = undefined;
}

async function handleSave(formData: BackendFormData) {
  try {
    // Extract credentials
    const credentials = formData.authType !== 'none' ? {
      username: formData.username,
      password: formData.password,
      token: formData.token,
      headers: formData.customHeaders?.reduce((acc, h) => {
        if (h.key && h.value) {
          acc[h.key] = h.value;
        }
        return acc;
      }, {} as Record<string, string>),
    } : undefined;

    if (editingBackend.value) {
      // Update existing backend
      await connectionStore.updateBackend(
        editingBackend.value.id,
        {
          name: formData.name,
          type: formData.type,
          endpoint: formData.endpoint,
          authType: formData.authType,
        },
        credentials
      );
    } else {
      // Create new backend
      await connectionStore.createBackend(
        {
          name: formData.name,
          type: formData.type,
          endpoint: formData.endpoint,
          authType: formData.authType,
        },
        credentials
      );
    }

    // Close form on success
    handleCancel();
  } catch (error) {
    console.error('Failed to save backend:', error);
    alert(error instanceof Error ? error.message : 'Failed to save backend');
  }
}
</script>

<style scoped>
.connection-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
