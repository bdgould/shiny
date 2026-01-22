<template>
  <div class="chat-input-container">
    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="inputValue"
        class="chat-textarea"
        :placeholder="placeholder"
        :disabled="disabled"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      ></textarea>
      <button
        class="send-button"
        :disabled="disabled || !inputValue.trim()"
        :aria-label="'Send message'"
        @click="sendMessage"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
    <div class="input-hint">Press Enter to send, Shift+Enter for new line</div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

defineProps<{
  disabled?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const inputValue = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function sendMessage() {
  const message = inputValue.value.trim()
  if (message) {
    emit('send', message)
    inputValue.value = ''
    nextTick(() => {
      autoResize()
    })
  }
}

function autoResize() {
  const textarea = textareaRef.value
  if (textarea) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set height to scrollHeight, capped at max height
    const maxHeight = 150
    const newHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${newHeight}px`
  }
}

/**
 * Focus the input (called from parent)
 */
function focus() {
  textareaRef.value?.focus()
}

/**
 * Set the input value programmatically (for quick actions)
 */
function setValue(value: string) {
  inputValue.value = value
  nextTick(() => {
    autoResize()
    focus()
  })
}

defineExpose({
  focus,
  setValue,
})
</script>

<style scoped>
.chat-input-container {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 8px 8px 8px 12px;
  transition: border-color 0.15s;
}

.input-wrapper:focus-within {
  border-color: var(--color-accent, #3b82f6);
}

.chat-textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-primary);
  font-family: inherit;
  min-height: 24px;
  max-height: 150px;
  overflow-y: auto;
}

.chat-textarea:focus {
  outline: none;
}

.chat-textarea::placeholder {
  color: var(--color-text-secondary);
}

.chat-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--color-accent, #3b82f6);
  color: white;
  cursor: pointer;
  transition:
    background-color 0.15s,
    opacity 0.15s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
  background: #2563eb;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 6px;
  text-align: center;
}
</style>
