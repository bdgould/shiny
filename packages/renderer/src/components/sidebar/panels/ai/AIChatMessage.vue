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
        @click="handleContentClick"
        v-html="renderedContent"
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
import { renderMarkdown, decodeHtmlEntities } from '@/services/markdown/markdownRenderer'

const props = defineProps<{
  message: ChatMessage
}>()

defineEmits<{
  approveToolCall: [toolCallId: string]
  rejectToolCall: [toolCallId: string]
}>()

/**
 * Handle clicks on dynamically rendered content (event delegation)
 */
function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.classList.contains('copy-code-btn')) {
    const code = target.dataset.code
    if (code) {
      copyToClipboard(decodeHtmlEntities(code), target)
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
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin: 8px 0;
  gap: 4px;
}

.markdown-content :deep(.copy-code-btn) {
  padding: 3px 10px;
  font-size: 11px;
  font-family: inherit;
  background: var(--color-background);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    border-color 0.2s;
}

.markdown-content :deep(.copy-code-btn:hover) {
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
}

.markdown-content :deep(.copy-code-btn.copied) {
  color: var(--color-success, #22c55e);
  border-color: var(--color-success, #22c55e);
}

.markdown-content :deep(pre) {
  background: var(--color-background);
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  overflow-x: auto;
  margin: 0;
  width: 100%;
  box-sizing: border-box;
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

/* Headers */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 16px 0 8px 0;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 1.5em;
}

.markdown-content :deep(h2) {
  font-size: 1.3em;
}

.markdown-content :deep(h3) {
  font-size: 1.15em;
}

.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-size: 1em;
}

.markdown-content :deep(h1:first-child),
.markdown-content :deep(h2:first-child),
.markdown-content :deep(h3:first-child),
.markdown-content :deep(h4:first-child),
.markdown-content :deep(h5:first-child),
.markdown-content :deep(h6:first-child) {
  margin-top: 0;
}

/* Paragraphs */
.markdown-content :deep(p) {
  margin: 8px 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* Lists */
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin: 4px 0;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li > ul),
.markdown-content :deep(li > ol) {
  margin: 4px 0;
}

/* Blockquotes */
.markdown-content :deep(blockquote) {
  margin: 8px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--color-accent, #3b82f6);
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.markdown-content :deep(blockquote p) {
  margin: 0;
}

/* Tables */
.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  font-size: 13px;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--color-border);
  padding: 6px 10px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: var(--color-background);
  font-weight: 600;
}

.markdown-content :deep(tr:nth-child(even)) {
  background: var(--color-background);
}

/* Horizontal rule */
.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 16px 0;
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
