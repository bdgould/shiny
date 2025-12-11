/**
 * Application settings persistence
 * Manages query connection settings and AI configuration
 */

const STORAGE_KEY_QUERY_SETTINGS = 'shiny:settings:query'
const STORAGE_KEY_AI_SETTINGS = 'shiny:settings:ai'

export interface QueryConnectionSettings {
  connectionTimeout: number // in milliseconds
  queryTimeout: number // in milliseconds
  maxRetries: number
  retryDelay: number // in milliseconds
}

export interface AIConnectionSettings {
  endpoint: string
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

const DEFAULT_QUERY_SETTINGS: QueryConnectionSettings = {
  connectionTimeout: 30000, // 30 seconds
  queryTimeout: 300000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000, // 1 second
}

const DEFAULT_AI_SETTINGS: AIConnectionSettings = {
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-3.5-turbo',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 1000,
}

/**
 * Get query connection settings
 */
export function getQuerySettings(): QueryConnectionSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_QUERY_SETTINGS)
    if (stored) {
      const parsed = JSON.parse(stored) as QueryConnectionSettings
      return { ...DEFAULT_QUERY_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load query settings from localStorage:', error)
  }
  return { ...DEFAULT_QUERY_SETTINGS }
}

/**
 * Save query connection settings
 */
export function saveQuerySettings(settings: QueryConnectionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_QUERY_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save query settings to localStorage:', error)
    throw error
  }
}

/**
 * Get AI connection settings
 */
export function getAISettings(): AIConnectionSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_AI_SETTINGS)
    if (stored) {
      const parsed = JSON.parse(stored) as AIConnectionSettings
      return { ...DEFAULT_AI_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load AI settings from localStorage:', error)
  }
  return { ...DEFAULT_AI_SETTINGS }
}

/**
 * Save AI connection settings
 */
export function saveAISettings(settings: AIConnectionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_AI_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save AI settings to localStorage:', error)
    throw error
  }
}

/**
 * Fetch available models from the AI endpoint
 */
export async function fetchAIModels(
  endpoint: string,
  apiKey: string
): Promise<{
  success: boolean
  models?: string[]
  error?: string
}> {
  try {
    // Convert chat completions endpoint to models endpoint
    const baseUrl = endpoint.replace(/\/chat\/completions$/, '').replace(/\/v1\/chat\/completions$/, '')
    const modelsUrl = `${baseUrl}/v1/models`

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }))
      return {
        success: false,
        error: `Failed to fetch models from ${modelsUrl}: ${errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`}`,
      }
    }

    const data = await response.json()
    const models = data.data?.map((model: any) => model.id) || []

    return {
      success: true,
      models,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Test AI endpoint connection
 */
export async function testAIConnection(settings: AIConnectionSettings): Promise<{
  success: boolean
  response?: string
  error?: string
  url?: string
}> {
  const url = settings.endpoint
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'user',
            content: 'Tell me a short fun fact.',
          },
        ],
        temperature: settings.temperature || 0.7,
        max_tokens: settings.maxTokens || 1000,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }))
      return {
        success: false,
        error: `${errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`}`,
        url,
      }
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message?.content || 'No response content'

    return {
      success: true,
      response: message,
      url,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      url,
    }
  }
}
