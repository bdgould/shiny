<template>
  <div class="ai-panel">
    <AIChatHeader
      :is-configured="aiChatStore.isConfigured"
      :has-messages="aiChatStore.hasMessages"
      @clear="handleClear"
    />

    <!-- Not configured warning -->
    <div v-if="!aiChatStore.isConfigured" class="config-warning">
      <div class="warning-icon">⚠</div>
      <div class="warning-text">
        AI is not configured. Please configure your API key in
        <button class="link-button" @click="openAISettings">Settings</button>.
      </div>
    </div>

    <AIChatMessages
      :messages="aiChatStore.messages"
      @approve-tool-call="handleApproveToolCall"
      @reject-tool-call="handleRejectToolCall"
    />

    <!-- Error display -->
    <div v-if="aiChatStore.error" class="error-banner">
      <span class="error-text">{{ aiChatStore.error }}</span>
      <button class="dismiss-button" @click="aiChatStore.setError(null)">Dismiss</button>
    </div>

    <AICannedActions
      :disabled="
        !aiChatStore.isConfigured || aiChatStore.isLoading || aiChatStore.hasPendingToolCalls
      "
      @action="handleQuickAction"
    />

    <AIChatInput
      ref="chatInputRef"
      :disabled="
        !aiChatStore.isConfigured || aiChatStore.isLoading || aiChatStore.hasPendingToolCalls
      "
      :placeholder="inputPlaceholder"
      @send="handleSendMessage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAIChatStore } from '@/stores/aiChat'
import { useTabsStore } from '@/stores/tabs'
import { streamChatCompletion, continueWithToolResults } from '@/services/ai/aiChatService'
import { executeTool } from '@/services/ai/toolExecutor'
import { requiresApproval } from '@/services/ai/aiTools'
import type { ToolCall } from '@/types/aiChat'
import AIChatHeader from './ai/AIChatHeader.vue'
import AIChatMessages from './ai/AIChatMessages.vue'
import AICannedActions from './ai/AICannedActions.vue'
import AIChatInput from './ai/AIChatInput.vue'

const aiChatStore = useAIChatStore()
const tabsStore = useTabsStore()
const chatInputRef = ref<InstanceType<typeof AIChatInput> | null>(null)

const inputPlaceholder = computed(() => {
  if (!aiChatStore.isConfigured) {
    return 'Configure AI to start chatting...'
  }
  if (aiChatStore.hasPendingToolCalls) {
    return 'Approve or reject pending tool calls...'
  }
  if (aiChatStore.isLoading) {
    return 'Waiting for response...'
  }
  return 'Ask about your SPARQL query...'
})

function openAISettings() {
  const existingTab = tabsStore.tabs.find((tab) => tab.settingsType === 'ai')
  if (existingTab) {
    tabsStore.setActiveTab(existingTab.id)
  } else {
    tabsStore.createTab({
      isSettings: true,
      settingsType: 'ai',
    })
  }
}

function handleClear() {
  aiChatStore.clearConversation()
}

async function handleSendMessage(content: string) {
  await sendMessageAndStream(content)
}

async function handleQuickAction(prompt: string) {
  await sendMessageAndStream(prompt)
}

async function sendMessageAndStream(content: string) {
  if (!aiChatStore.isConfigured) {
    aiChatStore.setError('Please configure your AI API key in settings.')
    return
  }

  // Add user message
  aiChatStore.addUserMessage(content)
  aiChatStore.setError(null)
  aiChatStore.setLoading(true)
  aiChatStore.setStreaming(true)

  // Create streaming message
  const streamingMessage = aiChatStore.startStreamingMessage()
  const context = aiChatStore.buildContext()

  try {
    let accumulatedContent = ''
    let toolCalls: ToolCall[] = []

    for await (const chunk of streamChatCompletion(aiChatStore.messages.slice(0, -1), context)) {
      if (chunk.type === 'content' && chunk.content !== undefined) {
        accumulatedContent = chunk.content
        aiChatStore.updateStreamingMessage(streamingMessage.id, accumulatedContent)
      } else if (chunk.type === 'tool_calls' && chunk.toolCalls) {
        toolCalls = chunk.toolCalls
        aiChatStore.updateStreamingMessage(streamingMessage.id, accumulatedContent, toolCalls)
      } else if (chunk.type === 'error' && chunk.error) {
        aiChatStore.setError(chunk.error)
        break
      }
    }

    aiChatStore.finalizeStreamingMessage(streamingMessage.id)

    // Process tool calls that don't require approval
    if (toolCalls.length > 0) {
      await processAutoApprovedToolCalls(streamingMessage.id, toolCalls)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    aiChatStore.setError(errorMessage)
  } finally {
    aiChatStore.setLoading(false)
    aiChatStore.setStreaming(false)
  }
}

async function processAutoApprovedToolCalls(messageId: string, toolCalls: ToolCall[]) {
  const autoApprovedCalls = toolCalls.filter((tc) => !requiresApproval(tc.name))

  // Execute all auto-approved tool calls first (without triggering continueConversation)
  for (const toolCall of autoApprovedCalls) {
    await executeToolCallOnly(messageId, toolCall.id)
  }

  // After all auto-approved tools are done, check if we should continue
  // Only continue if there are no pending (approval-required) tool calls left
  if (aiChatStore.pendingToolCalls.length === 0) {
    await continueConversation()
  }
}

async function handleApproveToolCall(messageId: string, toolCallId: string) {
  await executeToolCallOnly(messageId, toolCallId)

  // After manual approval, check if we should continue
  if (aiChatStore.pendingToolCalls.length === 0) {
    await continueConversation()
  }
}

async function handleRejectToolCall(messageId: string, toolCallId: string) {
  aiChatStore.updateToolCallStatus(messageId, toolCallId, 'rejected')

  // Add a tool result message indicating rejection
  aiChatStore.addToolMessage(toolCallId, JSON.stringify({ error: 'Tool call rejected by user' }))

  // Check if we should continue (no more pending approvals)
  if (aiChatStore.pendingToolCalls.length === 0) {
    await continueConversation()
  }
}

/**
 * Execute a tool call without automatically continuing the conversation.
 * Used by processAutoApprovedToolCalls and handleApproveToolCall.
 */
async function executeToolCallOnly(messageId: string, toolCallId: string) {
  const found = aiChatStore.findToolCall(toolCallId)
  if (!found) return

  const { toolCall } = found

  // Get the backend ID from the active tab - this is the source of truth
  const backendId = tabsStore.activeTab?.backendId || null

  // Update status to executing
  aiChatStore.updateToolCallStatus(messageId, toolCallId, 'executing')
  aiChatStore.setLoading(true)

  try {
    // Pass the backend ID explicitly to avoid Pinia store access issues in services
    const result = await executeTool(toolCall, { backendId })

    if (result.success) {
      aiChatStore.updateToolCallStatus(messageId, toolCallId, 'completed', result.result)
      aiChatStore.addToolMessage(toolCallId, JSON.stringify(result.result))
    } else {
      aiChatStore.updateToolCallStatus(messageId, toolCallId, 'error', undefined, result.error)
      aiChatStore.addToolMessage(toolCallId, JSON.stringify({ error: result.error }))
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Tool execution failed'
    aiChatStore.updateToolCallStatus(messageId, toolCallId, 'error', undefined, errorMessage)
    aiChatStore.addToolMessage(toolCallId, JSON.stringify({ error: errorMessage }))
  } finally {
    aiChatStore.setLoading(false)
  }
}

async function continueConversation() {
  aiChatStore.setLoading(true)
  aiChatStore.setStreaming(true)

  const streamingMessage = aiChatStore.startStreamingMessage()
  const context = aiChatStore.buildContext()

  try {
    let accumulatedContent = ''
    let toolCalls: ToolCall[] = []

    for await (const chunk of continueWithToolResults(aiChatStore.messages.slice(0, -1), context)) {
      if (chunk.type === 'content' && chunk.content !== undefined) {
        accumulatedContent = chunk.content
        aiChatStore.updateStreamingMessage(streamingMessage.id, accumulatedContent)
      } else if (chunk.type === 'tool_calls' && chunk.toolCalls) {
        toolCalls = chunk.toolCalls
        aiChatStore.updateStreamingMessage(streamingMessage.id, accumulatedContent, toolCalls)
      } else if (chunk.type === 'error' && chunk.error) {
        aiChatStore.setError(chunk.error)
        break
      }
    }

    aiChatStore.finalizeStreamingMessage(streamingMessage.id)

    // Process any new tool calls
    if (toolCalls.length > 0) {
      await processAutoApprovedToolCalls(streamingMessage.id, toolCalls)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    aiChatStore.setError(errorMessage)
  } finally {
    aiChatStore.setLoading(false)
    aiChatStore.setStreaming(false)
  }
}
</script>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.config-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.1);
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
}

.warning-icon {
  font-size: 16px;
}

.warning-text {
  font-size: 13px;
  color: var(--color-text-primary);
}

.link-button {
  background: none;
  border: none;
  color: var(--color-accent, #3b82f6);
  font-size: inherit;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.link-button:hover {
  color: #2563eb;
}

.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.1);
  border-top: 1px solid rgba(239, 68, 68, 0.3);
}

.error-text {
  font-size: 13px;
  color: var(--color-error, #ef4444);
}

.dismiss-button {
  background: none;
  border: none;
  color: var(--color-error, #ef4444);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.dismiss-button:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
