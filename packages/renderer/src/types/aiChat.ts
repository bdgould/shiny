/**
 * Type definitions for AI Chat Assistant
 */

/**
 * Tool call status in the approval flow
 */
export type ToolCallStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'error'

/**
 * A tool call requested by the AI
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string
  /** Tool name (e.g., "searchOntology", "runSparqlQuery") */
  name: string
  /** Arguments passed to the tool */
  arguments: Record<string, unknown>
  /** Current status of the tool call */
  status: ToolCallStatus
  /** Result after execution (if completed) */
  result?: unknown
  /** Error message (if status is 'error') */
  error?: string
}

/**
 * Role of a chat message
 */
export type ChatMessageRole = 'user' | 'assistant' | 'tool'

/**
 * A single message in the chat conversation
 */
export interface ChatMessage {
  /** Unique identifier */
  id: string
  /** Who sent the message */
  role: ChatMessageRole
  /** Message content (markdown for assistant, plain text for user) */
  content: string
  /** When the message was created */
  timestamp: number
  /** Tool calls made by the assistant (only for assistant messages) */
  toolCalls?: ToolCall[]
  /** Whether the message is currently streaming */
  isStreaming?: boolean
  /** Tool call ID this message is responding to (only for tool messages) */
  toolCallId?: string
}

/**
 * Backend context passed to AI (no credentials)
 */
export interface BackendContext {
  /** Backend display name */
  name: string
  /** Backend type (e.g., "graphdb") */
  type: string
  /** Endpoint URL */
  endpoint: string
}

/**
 * Ontology statistics passed to AI
 */
export interface OntologyContext {
  /** Number of classes in cache */
  classCount: number
  /** Number of properties in cache */
  propertyCount: number
  /** Number of individuals in cache */
  individualCount: number
  /** List of namespace prefixes */
  namespaces: string[]
}

/**
 * Full context passed to AI for conversation
 */
export interface ConversationContext {
  /** Current SPARQL query in editor */
  currentQuery: string
  /** Selected backend info (no credentials) */
  backend: BackendContext | null
  /** Ontology cache statistics */
  ontology: OntologyContext | null
}

/**
 * Quick action button configuration
 */
export interface QuickAction {
  /** Button label */
  label: string
  /** Prompt to send when clicked */
  prompt: string
  /** Optional icon name */
  icon?: string
}

/**
 * Persisted conversation state
 */
export interface PersistedConversation {
  /** Messages in the conversation */
  messages: ChatMessage[]
  /** When the conversation was last updated */
  lastUpdated: number
}

/**
 * OpenAI-compatible message format for API
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

/**
 * OpenAI-compatible tool call format
 */
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * OpenAI-compatible function definition
 */
export interface OpenAIFunction {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<
      string,
      {
        type: string
        description: string
        enum?: string[]
      }
    >
    required?: string[]
  }
}

/**
 * OpenAI-compatible tool definition
 */
export interface OpenAITool {
  type: 'function'
  function: OpenAIFunction
}

/**
 * Streaming chunk from OpenAI-compatible API
 */
export interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: string | null
  }>
}
