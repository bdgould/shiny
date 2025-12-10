<template>
  <div class="connection-panel">
    <BackendList v-if="!showForm" @add="handleAdd" @edit="handleEdit" />
    <ConnectionForm v-else :backend="editingBackend" @save="handleSave" @cancel="handleCancel" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import BackendList from './BackendList.vue'
import ConnectionForm from './ConnectionForm.vue'
import type { BackendConfig } from '@/types/backends'
import type { BackendFormData } from '@/composables/useBackendValidation'

const connectionStore = useConnectionStore()

const showForm = ref(false)
const editingBackend = ref<BackendConfig | undefined>(undefined)

function handleAdd() {
  editingBackend.value = undefined
  showForm.value = true
}

function handleEdit(backend: BackendConfig) {
  editingBackend.value = backend
  showForm.value = true
}

function handleCancel() {
  showForm.value = false
  editingBackend.value = undefined
}

async function handleSave(formData: BackendFormData) {
  try {
    // Extract credentials only if user has provided values
    // When editing, only pass credentials if they've been changed/entered
    let credentials = undefined

    if (formData.authType !== 'none') {
      // Check if user has actually entered credential values
      const hasBasicAuth = formData.authType === 'basic' && formData.username && formData.password
      const hasBearerToken = formData.authType === 'bearer' && formData.token
      const hasCustomHeaders =
        formData.authType === 'custom' && formData.customHeaders?.some((h) => h.key && h.value)

      // Only build credentials object if user has entered values
      if (hasBasicAuth || hasBearerToken || hasCustomHeaders) {
        credentials = {
          username: formData.username,
          password: formData.password,
          token: formData.token,
          headers: formData.customHeaders?.reduce(
            (acc, h) => {
              if (h.key && h.value) {
                acc[h.key] = h.value
              }
              return acc
            },
            {} as Record<string, string>
          ),
        }
      }
    }

    // Build provider config for GraphStudio
    let providerConfig: string | undefined = undefined
    if (formData.type === 'graphstudio' && formData.graphmartUri) {
      providerConfig = JSON.stringify({
        graphmartUri: formData.graphmartUri,
        graphmartName: formData.graphmartName || '',
        selectedLayers: formData.selectedLayers || ['ALL_LAYERS'],
      })
    }

    // Build provider config for Mobi
    if (formData.type === 'mobi') {
      const queryMode = formData.queryMode || 'record'

      console.log('[ConnectionPanel] Building Mobi config:', {
        queryMode,
        repositoryId: formData.repositoryId,
        recordId: formData.recordId,
        formData,
      })

      if (queryMode === 'repository' && formData.repositoryId) {
        // Repository mode configuration
        providerConfig = JSON.stringify({
          queryMode: 'repository',
          repositoryId: formData.repositoryId,
          repositoryTitle: formData.repositoryTitle || '',
          branchId: formData.branchId || '',
          branchTitle: formData.branchTitle || '',
          includeImports: formData.includeImports || false,
        })
        console.log('[ConnectionPanel] Created repository config:', providerConfig)
      } else if (queryMode === 'record' && formData.recordId) {
        // Record mode configuration
        providerConfig = JSON.stringify({
          queryMode: 'record',
          catalogId: formData.catalogId,
          catalogTitle: formData.catalogTitle || '',
          recordId: formData.recordId,
          recordTitle: formData.recordTitle || '',
          recordType: formData.recordType || '',
          branchId: formData.branchId || '',
          branchTitle: formData.branchTitle || '',
          includeImports: formData.includeImports || false,
        })
        console.log('[ConnectionPanel] Created record config:', providerConfig)
      } else {
        console.warn('[ConnectionPanel] No valid Mobi configuration - missing required fields')
      }
    }

    if (editingBackend.value) {
      // Update existing backend
      await connectionStore.updateBackend(
        editingBackend.value.id,
        {
          name: formData.name,
          type: formData.type,
          endpoint: formData.endpoint,
          authType: formData.authType,
          providerConfig,
          allowInsecure: formData.allowInsecure,
        },
        credentials
      )
    } else {
      // Create new backend
      await connectionStore.createBackend(
        {
          name: formData.name,
          type: formData.type,
          endpoint: formData.endpoint,
          authType: formData.authType,
          providerConfig,
          allowInsecure: formData.allowInsecure,
        },
        credentials
      )
    }

    // Close form on success
    handleCancel()
  } catch (error) {
    console.error('Failed to save backend:', error)
    alert(error instanceof Error ? error.message : 'Failed to save backend')
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
