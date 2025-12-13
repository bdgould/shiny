/**
 * Application settings persistence
 * Manages query connection settings, AI configuration, and cache settings
 */

const STORAGE_KEY_QUERY_SETTINGS = 'shiny:settings:query'
const STORAGE_KEY_AI_SETTINGS = 'shiny:settings:ai'
const STORAGE_KEY_CACHE_SETTINGS = 'shiny:settings:cache'
const STORAGE_KEY_PREFIX_SETTINGS = 'shiny:settings:prefix'

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

export interface GlobalCacheSettings {
  enableAutocomplete: boolean
  defaultTtl: number
  defaultMaxElements: number
  autoRefresh: boolean
  refreshCheckInterval: number
}

export interface PrefixDefinition {
  prefix: string
  namespace: string
}

export interface PrefixManagementSettings {
  prefixes: PrefixDefinition[]
}

const DEFAULT_QUERY_SETTINGS: QueryConnectionSettings = {
  connectionTimeout: 30000, // 30 seconds
  queryTimeout: 300000, // 5 minutes
  maxRetries: 3,
  retryDelay: 1000, // 1 second
}

const DEFAULT_AI_SETTINGS: AIConnectionSettings = {
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 1000,
}

const DEFAULT_CACHE_SETTINGS: GlobalCacheSettings = {
  enableAutocomplete: true,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  defaultMaxElements: 50000,
  autoRefresh: true,
  refreshCheckInterval: 5 * 60 * 1000 // 5 minutes
}

const DEFAULT_PREFIX_SETTINGS: PrefixManagementSettings = {
  prefixes: [
    { prefix: 'rdf', namespace: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
    { prefix: 'rdfs', namespace: 'http://www.w3.org/2000/01/rdf-schema#' },
    { prefix: 'owl', namespace: 'http://www.w3.org/2002/07/owl#' },
    { prefix: 'xsd', namespace: 'http://www.w3.org/2001/XMLSchema#' },
    { prefix: 'skos', namespace: 'http://www.w3.org/2004/02/skos/core#' },
    { prefix: 'dcterms', namespace: 'http://purl.org/dc/terms/' },
    { prefix: 'foaf', namespace: 'http://xmlns.com/foaf/0.1/' },
  ]
}

/**
 * Normalize base URL - ensure it ends with /v1 and doesn't have trailing slash
 */
function normalizeBaseUrl(url: string): string {
  // Remove trailing slash
  let normalized = url.replace(/\/$/, '')

  // Remove /chat/completions if present
  normalized = normalized.replace(/\/chat\/completions$/, '')

  // Ensure it ends with /v1
  if (!normalized.endsWith('/v1')) {
    normalized = `${normalized}/v1`
  }

  return normalized
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
  baseUrl: string,
  apiKey: string
): Promise<{
  success: boolean
  models?: string[]
  error?: string
}> {
  try {
    const normalized = normalizeBaseUrl(baseUrl)
    const modelsUrl = `${normalized}/models`

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
  const baseUrl = normalizeBaseUrl(settings.endpoint)
  const url = `${baseUrl}/chat/completions`

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

/**
 * Get global cache settings
 */
export function getCacheSettings(): GlobalCacheSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CACHE_SETTINGS)
    if (stored) {
      const parsed = JSON.parse(stored) as GlobalCacheSettings
      return { ...DEFAULT_CACHE_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load cache settings from localStorage:', error)
  }
  return { ...DEFAULT_CACHE_SETTINGS }
}

/**
 * Save global cache settings
 */
export function saveCacheSettings(settings: GlobalCacheSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_CACHE_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save cache settings to localStorage:', error)
    throw error
  }
}

/**
 * Get prefix management settings
 */
export function getPrefixSettings(): PrefixManagementSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX_SETTINGS)
    if (stored) {
      const parsed = JSON.parse(stored) as PrefixManagementSettings
      return { ...DEFAULT_PREFIX_SETTINGS, ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load prefix settings from localStorage:', error)
  }
  return { ...DEFAULT_PREFIX_SETTINGS }
}

/**
 * Save prefix management settings
 */
export function savePrefixSettings(settings: PrefixManagementSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save prefix settings to localStorage:', error)
    throw error
  }
}
