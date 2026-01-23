/**
 * Pinia store for AI Chat Assistant state management
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ChatMessage,
  ToolCall,
  ConversationContext,
  PersistedConversation,
} from '../types/aiChat'
import { useTabsStore } from './tabs'
import { useConnectionStore } from './connection'
import { useOntologyCacheStore } from './ontologyCache'
import { getAISettings } from '../services/preferences/appSettings'

const STORAGE_KEY = 'shiny:ai:conversation'
const MAX_MESSAGES = 100

/**
 * Generate a unique ID for messages and tool calls
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useAIChatStore = defineStore('aiChat', () => {
  // State
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)
  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const hasMessages = computed(() => messages.value.length > 0)

  const isConfigured = computed(() => {
    const settings = getAISettings()
    return !!settings.apiKey && !!settings.endpoint
  })

  const pendingToolCalls = computed(() => {
    return messages.value.flatMap((m) => m.toolCalls || []).filter((tc) => tc.status === 'pending')
  })

  const hasPendingToolCalls = computed(() => pendingToolCalls.value.length > 0)

  // Actions

  /**
   * Build context from current application state
   */
  function buildContext(): ConversationContext {
    const tabsStore = useTabsStore()
    const connectionStore = useConnectionStore()
    const ontologyCacheStore = useOntologyCacheStore()

    // Get current query from active tab
    const currentQuery = tabsStore.activeTab?.query || ''

    // Get the backend ID from the active tab (not the global selection)
    const activeBackendId = tabsStore.activeTab?.backendId

    // Get backend info (no credentials) - look up by the tab's backend ID
    let backend = null
    if (activeBackendId) {
      const b = connectionStore.backends.find((b) => b.id === activeBackendId)
      if (b) {
        backend = {
          name: b.name,
          type: b.type,
          endpoint: b.endpoint,
        }
      }
    }

    // Get ontology stats from cache using the tab's backend ID
    let ontology = null
    if (activeBackendId) {
      const cache = ontologyCacheStore.getCache(activeBackendId)
      if (cache) {
        ontology = {
          classCount: cache.classes.length,
          propertyCount: cache.properties.length,
          individualCount: cache.individuals.length,
          namespaces: Object.keys(cache.namespaces),
        }
      }
    }

    return {
      currentQuery,
      backend,
      ontology,
    }
  }

  /**
   * Add a user message to the conversation
   */
  function addUserMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    messages.value.push(message)
    trimMessages()
    persistConversation()
    return message
  }

  /**
   * Add an assistant message to the conversation
   */
  function addAssistantMessage(content: string, toolCalls?: ToolCall[]): ChatMessage {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      toolCalls,
      isStreaming: false,
    }
    messages.value.push(message)
    trimMessages()
    persistConversation()
    return message
  }

  /**
   * Add a tool result message to the conversation
   */
  function addToolMessage(toolCallId: string, content: string): ChatMessage {
    const message: ChatMessage = {
      id: generateId(),
      role: 'tool',
      content,
      timestamp: Date.now(),
      toolCallId,
    }
    messages.value.push(message)
    trimMessages()
    persistConversation()
    return message
  }

  /**
   * Create a streaming assistant message
   */
  function startStreamingMessage(): ChatMessage {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    messages.value.push(message)
    return message
  }

  /**
   * Update a streaming message's content
   */
  function updateStreamingMessage(messageId: string, content: string, toolCalls?: ToolCall[]) {
    const message = messages.value.find((m) => m.id === messageId)
    if (message) {
      message.content = content
      if (toolCalls) {
        message.toolCalls = toolCalls
      }
    }
  }

  /**
   * Finalize a streaming message
   */
  function finalizeStreamingMessage(messageId: string) {
    const message = messages.value.find((m) => m.id === messageId)
    if (message) {
      message.isStreaming = false
      persistConversation()
    }
  }

  /**
   * Update a tool call's status
   */
  function updateToolCallStatus(
    messageId: string,
    toolCallId: string,
    status: ToolCall['status'],
    result?: unknown,
    errorMsg?: string,
    timing?: { startedAt?: number; completedAt?: number; latencyMs?: number }
  ) {
    const message = messages.value.find((m) => m.id === messageId)
    if (message?.toolCalls) {
      const toolCall = message.toolCalls.find((tc) => tc.id === toolCallId)
      if (toolCall) {
        toolCall.status = status
        if (result !== undefined) {
          toolCall.result = result
        }
        if (errorMsg !== undefined) {
          toolCall.error = errorMsg
        }
        if (timing) {
          if (timing.startedAt !== undefined) {
            toolCall.startedAt = timing.startedAt
          }
          if (timing.completedAt !== undefined) {
            toolCall.completedAt = timing.completedAt
          }
          if (timing.latencyMs !== undefined) {
            toolCall.latencyMs = timing.latencyMs
          }
        }
        persistConversation()
      }
    }
  }

  /**
   * Find a tool call by ID across all messages
   */
  function findToolCall(toolCallId: string): { message: ChatMessage; toolCall: ToolCall } | null {
    for (const message of messages.value) {
      if (message.toolCalls) {
        const toolCall = message.toolCalls.find((tc) => tc.id === toolCallId)
        if (toolCall) {
          return { message, toolCall }
        }
      }
    }
    return null
  }

  /**
   * Clear all messages
   */
  function clearConversation() {
    messages.value = []
    error.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  /**
   * Set error state
   */
  function setError(message: string | null) {
    error.value = message
  }

  /**
   * Set loading state
   */
  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  /**
   * Set streaming state
   */
  function setStreaming(streaming: boolean) {
    isStreaming.value = streaming
  }

  /**
   * Trim messages to max limit
   */
  function trimMessages() {
    if (messages.value.length > MAX_MESSAGES) {
      messages.value = messages.value.slice(-MAX_MESSAGES)
    }
  }

  /**
   * Persist conversation to localStorage
   */
  function persistConversation() {
    try {
      const data: PersistedConversation = {
        messages: messages.value,
        lastUpdated: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.warn('Failed to persist AI conversation:', err)
    }
  }

  /**
   * Restore conversation from localStorage
   */
  function restoreConversation() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored) as PersistedConversation
        // Mark any incomplete streaming messages as complete
        messages.value = data.messages.map((m) => ({
          ...m,
          isStreaming: false,
        }))
      }
    } catch (err) {
      console.warn('Failed to restore AI conversation:', err)
    }
  }

  // Initialize by restoring conversation
  restoreConversation()

  return {
    // State
    messages,
    isLoading,
    isStreaming,
    error,

    // Computed
    hasMessages,
    isConfigured,
    pendingToolCalls,
    hasPendingToolCalls,

    // Actions
    buildContext,
    addUserMessage,
    addAssistantMessage,
    addToolMessage,
    startStreamingMessage,
    updateStreamingMessage,
    finalizeStreamingMessage,
    updateToolCallStatus,
    findToolCall,
    clearConversation,
    setError,
    setLoading,
    setStreaming,
    restoreConversation,
  }
})
