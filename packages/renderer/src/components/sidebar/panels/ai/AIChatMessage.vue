<template>
  <div class="chat-message" :class="[`role-${message.role}`]">
    <!-- User message -->
    <div v-if="message.role === 'user'" class="message-bubble user-bubble">
      <div class="message-content">{{ message.content }}</div>
    </div>

    <!-- Assistant message -->
    <div v-else-if="message.role === 'assistant'" class="message-bubble assistant-bubble">
      <div
        v-if="message.content"
        class="message-content markdown-content"
        v-html="renderedContent"
        @click="handleContentClick"
      ></div>
      <div v-if="message.isStreaming && !message.content" class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <!-- Tool calls -->
      <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
        <ToolCallCard
          v-for="toolCall in message.toolCalls"
          :key="toolCall.id"
          :tool-call="toolCall"
          @approve="$emit('approveToolCall', toolCall.id)"
          @reject="$emit('rejectToolCall', toolCall.id)"
        />
      </div>
    </div>

    <!-- Tool result message (hidden from UI, handled internally) -->
    <div v-else-if="message.role === 'tool'" class="tool-result-indicator">
      Tool result received
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/aiChat'
import ToolCallCard from './ToolCallCard.vue'

const props = defineProps<{
  message: ChatMessage
}>()

defineEmits<{
  approveToolCall: [toolCallId: string]
  rejectToolCall: [toolCallId: string]
}>()

/**
 * Simple markdown renderer
 * Handles: code blocks, inline code, bold, italic, links
 */
function renderMarkdown(text: string): string {
  let html = escapeHtml(text)

  // Code blocks (```language\ncode\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : ''
    const trimmedCode = code.trim()
    // Escape code for data attribute: quotes and newlines (use &#10; so \n-><br> replacement doesn't affect it)
    const dataCode = trimmedCode.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
    return `<div class="code-block-wrapper"><button class="copy-code-btn" data-code="${dataCode}">Copy</button><pre><code${langClass}>${trimmedCode}</code></pre></div>`
  })

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  return html
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Decode HTML entities back to original characters for clipboard copy
 */
function decodeHtml(text: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#10;': '\n'
  }
  return text.replace(/&(amp|lt|gt|quot|#039|#10);/g, (m) => map[m])
}

/**
 * Handle clicks on dynamically rendered content (event delegation)
 */
function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.classList.contains('copy-code-btn')) {
    const code = target.dataset.code
    if (code) {
      copyToClipboard(decodeHtml(code), target)
    }
  }
}

/**
 * Copy text to clipboard with visual feedback
 */
async function copyToClipboard(text: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text)
    button.textContent = '✓ Copied!'
    button.classList.add('copied')
    setTimeout(() => {
      button.textContent = 'Copy'
      button.classList.remove('copied')
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

const renderedContent = computed(() => {
  return renderMarkdown(props.message.content)
})
</script>

<style scoped>
.chat-message {
  margin-bottom: 12px;
}

.chat-message.role-user {
  display: flex;
  justify-content: flex-end;
}

.chat-message.role-assistant {
  display: flex;
  justify-content: flex-start;
}

.chat-message.role-tool {
  display: none;
}

.message-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.user-bubble {
  background: var(--color-accent, #3b82f6);
  color: white;
  border-bottom-right-radius: 4px;
}

.assistant-bubble {
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  border-bottom-left-radius: 4px;
  border: 1px solid var(--color-border);
}

.message-content {
  word-wrap: break-word;
}

/* Markdown styles */
.markdown-content :deep(.code-block-wrapper) {
  position: relative;
  margin: 8px 0;
}

.markdown-content :deep(.copy-code-btn) {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background-color 0.2s;
  z-index: 1;
}

.markdown-content :deep(.code-block-wrapper:hover .copy-code-btn) {
  opacity: 1;
}

.markdown-content :deep(.copy-code-btn:hover) {
  background: var(--color-background);
}

.markdown-content :deep(.copy-code-btn.copied) {
  color: var(--color-success, #22c55e);
  border-color: var(--color-success, #22c55e);
}

.markdown-content :deep(pre) {
  background: var(--color-background);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}

.markdown-content :deep(code) {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-content :deep(code:not(pre code)) {
  background: var(--color-background);
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-content :deep(a) {
  color: var(--color-accent, #3b82f6);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(em) {
  font-style: italic;
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--color-text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Tool calls section */
.tool-calls {
  margin-top: 8px;
}

.tool-result-indicator {
  display: none;
}
</style>
