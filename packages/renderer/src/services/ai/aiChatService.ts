/**
 * AI Chat Service
 * Handles communication with OpenAI-compatible APIs
 */

import type {
  ChatMessage,
  ToolCall,
  ConversationContext,
  OpenAIMessage,
  OpenAIStreamChunk,
  OpenAIToolCall,
} from '../../types/aiChat'
import { getAISettings, normalizeBaseUrl } from '../preferences/appSettings'
import { aiTools, requiresApproval } from './aiTools'

/**
 * Build the system prompt with context
 */
export function buildSystemPrompt(context: ConversationContext): string {
  const parts: string[] = [
    'You are a helpful SPARQL query assistant. You help users write, understand, optimize, and debug SPARQL queries.',
    '',
    'You have access to tools that let you:',
    '- Search the ontology for classes, properties, and individuals',
    '- Get details about specific ontology elements',
    '- Execute SPARQL queries (requires user approval)',
    '',
    'When helping with queries:',
    '- Explain concepts clearly',
    '- Suggest improvements and best practices',
    '- Point out potential issues or errors',
    '- Use the ontology search tools to find relevant classes and properties',
    '',
    'IMPORTANT: The runSparqlQuery tool requires user approval before execution. The user will see the query and can approve or reject it.',
  ]

  // Add current query context
  if (context.currentQuery) {
    parts.push('')
    parts.push('## Current Query in Editor')
    parts.push('```sparql')
    parts.push(context.currentQuery)
    parts.push('```')
  }

  // Add backend context
  if (context.backend) {
    parts.push('')
    parts.push('## Connected Backend')
    parts.push(`- Name: ${context.backend.name}`)
    parts.push(`- Type: ${context.backend.type}`)
    parts.push(`- Endpoint: ${context.backend.endpoint}`)
  }

  // Add ontology context
  if (context.ontology) {
    parts.push('')
    parts.push('## Ontology Cache')
    parts.push(`- Classes: ${context.ontology.classCount}`)
    parts.push(`- Properties: ${context.ontology.propertyCount}`)
    parts.push(`- Individuals: ${context.ontology.individualCount}`)
    if (context.ontology.namespaces.length > 0) {
      parts.push(`- Available prefixes: ${context.ontology.namespaces.join(', ')}`)
    }
  }

  return parts.join('\n')
}

/**
 * Convert internal messages to OpenAI format
 */
export function messagesToOpenAI(messages: ChatMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({
        role: 'user',
        content: msg.content,
      })
    } else if (msg.role === 'assistant') {
      const openaiMsg: OpenAIMessage = {
        role: 'assistant',
        content: msg.content || null,
      }

      // Add tool calls if present
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))
      }

      result.push(openaiMsg)
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId,
      })
    }
  }

  return result
}

/**
 * Parse tool calls from OpenAI streaming chunks
 */
interface PartialToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * Stream chat completion from OpenAI-compatible API
 */
export async function* streamChatCompletion(
  messages: ChatMessage[],
  context: ConversationContext
): AsyncGenerator<{
  type: 'content' | 'tool_calls' | 'error' | 'done'
  content?: string
  toolCalls?: ToolCall[]
  error?: string
}> {
  const settings = getAISettings()

  if (!settings.apiKey) {
    yield { type: 'error', error: 'API key not configured' }
    return
  }

  const baseUrl = normalizeBaseUrl(settings.endpoint)
  const url = `${baseUrl}/chat/completions`

  const systemPrompt = buildSystemPrompt(context)
  const openaiMessages = messagesToOpenAI(messages)

  const requestBody = {
    model: settings.model,
    messages: [{ role: 'system', content: systemPrompt }, ...openaiMessages],
    tools: aiTools,
    stream: true,
    temperature: settings.temperature ?? 0.7,
    max_tokens: settings.maxTokens ?? 2000,
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`
      try {
        const errorBody = await response.json()
        if (errorBody.error?.message) {
          errorMessage = errorBody.error.message
        }
      } catch {
        // Ignore JSON parse errors
      }
      yield { type: 'error', error: errorMessage }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let accumulatedContent = ''
    const partialToolCalls: Map<number, PartialToolCall> = new Map()

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()

        if (!trimmed || trimmed === 'data: [DONE]') {
          continue
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6)
          try {
            const chunk: OpenAIStreamChunk = JSON.parse(jsonStr)
            const choice = chunk.choices[0]

            if (!choice) continue

            // Handle content delta
            if (choice.delta.content) {
              accumulatedContent += choice.delta.content
              yield { type: 'content', content: accumulatedContent }
            }

            // Handle tool call deltas
            if (choice.delta.tool_calls) {
              for (const tcDelta of choice.delta.tool_calls) {
                const index = tcDelta.index

                if (!partialToolCalls.has(index)) {
                  partialToolCalls.set(index, {
                    id: tcDelta.id || '',
                    name: tcDelta.function?.name || '',
                    arguments: '',
                  })
                }

                const partial = partialToolCalls.get(index)!

                if (tcDelta.id) {
                  partial.id = tcDelta.id
                }
                if (tcDelta.function?.name) {
                  partial.name = tcDelta.function.name
                }
                if (tcDelta.function?.arguments) {
                  partial.arguments += tcDelta.function.arguments
                }
              }
            }

            // Check if stream is complete
            if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
              // Convert partial tool calls to full tool calls
              if (partialToolCalls.size > 0) {
                const toolCalls: ToolCall[] = []

                for (const [, partial] of partialToolCalls) {
                  let args: Record<string, unknown> = {}
                  try {
                    args = JSON.parse(partial.arguments)
                  } catch {
                    console.warn('Failed to parse tool call arguments:', partial.arguments)
                  }

                  toolCalls.push({
                    id: partial.id,
                    name: partial.name,
                    arguments: args,
                    status: requiresApproval(partial.name) ? 'pending' : 'approved',
                  })
                }

                yield { type: 'tool_calls', toolCalls }
              }
            }
          } catch (e) {
            console.warn('Failed to parse SSE chunk:', jsonStr, e)
          }
        }
      }
    }

    yield { type: 'done' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    yield { type: 'error', error: message }
  }
}

/**
 * Continue conversation after tool results
 */
export async function* continueWithToolResults(
  messages: ChatMessage[],
  context: ConversationContext
): AsyncGenerator<{
  type: 'content' | 'tool_calls' | 'error' | 'done'
  content?: string
  toolCalls?: ToolCall[]
  error?: string
}> {
  // Reuse the same streaming logic
  yield* streamChatCompletion(messages, context)
}
