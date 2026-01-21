<template>
  <div class="chat-messages" ref="messagesContainer">
    <div v-if="messages.length === 0" class="empty-state">
      <div class="empty-icon">💬</div>
      <div class="empty-title">Ask me about your SPARQL query</div>
      <div class="empty-subtitle">
        I can help you write, optimize, and debug SPARQL queries.
      </div>
    </div>

    <div v-else class="messages-list">
      <AIChatMessage
        v-for="message in visibleMessages"
        :key="message.id"
        :message="message"
        @approve-tool-call="$emit('approveToolCall', message.id, $event)"
        @reject-tool-call="$emit('rejectToolCall', message.id, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ChatMessage } from '@/types/aiChat'
import AIChatMessage from './AIChatMessage.vue'

const props = defineProps<{
  messages: ChatMessage[]
}>()

defineEmits<{
  approveToolCall: [messageId: string, toolCallId: string]
  rejectToolCall: [messageId: string, toolCallId: string]
}>()

const messagesContainer = ref<HTMLElement | null>(null)

// Filter out tool messages from display (they're handled internally)
const visibleMessages = computed(() => {
  return props.messages.filter((m) => m.role !== 'tool')
})

// Auto-scroll to bottom when messages change
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

// Also scroll when streaming content updates
watch(
  () => {
    const lastMessage = props.messages[props.messages.length - 1]
    return lastMessage?.content?.length || 0
  },
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
</script>

<style scoped>
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.empty-subtitle {
  font-size: 14px;
  max-width: 200px;
  line-height: 1.4;
}

.messages-list {
  display: flex;
  flex-direction: column;
}
</style>
