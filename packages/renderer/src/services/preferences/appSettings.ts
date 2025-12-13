/**
 * Application settings persistence
 * Manages query connection settings, AI configuration, and cache settings
 */

const STORAGE_KEY_QUERY_SETTINGS = 'shiny:settings:query'
const STORAGE_KEY_AI_SETTINGS = 'shiny:settings:ai'
const STORAGE_KEY_CACHE_SETTINGS = 'shiny:settings:cache'
const STORAGE_KEY_SPARQL_FORMATTING_SETTINGS = 'shiny:settings:sparql-formatting'

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

export interface SparqlFormattingSettings {
  indentSize: number // Number of spaces for indentation
  useTabs: boolean // Use tabs instead of spaces
  keywordCase: 'uppercase' | 'lowercase' // Case for SPARQL keywords
  alignPrefixes: boolean // Align PREFIX declarations
  alignPredicates: boolean // Align predicates in triple patterns
  useRdfTypeShorthand: boolean // Use 'a' instead of rdf:type or full IRI
  braceStyle: 'same-line' | 'new-line' // Opening brace placement
  insertSpaces: {
    afterCommas: boolean // Space after commas in value lists
    beforeBraces: boolean // Space before opening braces
    afterBraces: boolean // Space after opening braces
    beforeParentheses: boolean // Space before opening parentheses
    beforeStatementSeparators: boolean // Space before . and ; separators
  }
  lineBreaks: {
    afterPrefix: boolean // Line break after each PREFIX
    afterSelect: boolean // Line break after SELECT clause
    afterWhere: boolean // Line break after WHERE clause
    betweenClauses: boolean // Blank line between major clauses
    betweenPrefixAndQuery: boolean // Blank line between PREFIXes and query
  }
  maxLineLength: number // Maximum line length before wrapping
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

const DEFAULT_SPARQL_FORMATTING_SETTINGS: SparqlFormattingSettings = {
  indentSize: 2,
  useTabs: false,
  keywordCase: 'uppercase',
  alignPrefixes: true,
  alignPredicates: false,
  useRdfTypeShorthand: true,
  braceStyle: 'same-line',
  insertSpaces: {
    afterCommas: true,
    beforeBraces: true,
    afterBraces: true,
    beforeParentheses: false,
    beforeStatementSeparators: false,
  },
  lineBreaks: {
    afterPrefix: true,
    afterSelect: true,
    afterWhere: true,
    betweenClauses: false,
    betweenPrefixAndQuery: true,
  },
  maxLineLength: 120,
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
 * Get SPARQL formatting settings
 */
export function getSparqlFormattingSettings(): SparqlFormattingSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SPARQL_FORMATTING_SETTINGS)
    if (stored) {
      const parsed = JSON.parse(stored) as SparqlFormattingSettings
      // Deep merge for nested objects
      return {
        ...DEFAULT_SPARQL_FORMATTING_SETTINGS,
        ...parsed,
        insertSpaces: {
          ...DEFAULT_SPARQL_FORMATTING_SETTINGS.insertSpaces,
          ...(parsed.insertSpaces || {}),
        },
        lineBreaks: {
          ...DEFAULT_SPARQL_FORMATTING_SETTINGS.lineBreaks,
          ...(parsed.lineBreaks || {}),
        },
      }
    }
  } catch (error) {
    console.warn('Failed to load SPARQL formatting settings from localStorage:', error)
  }
  return { ...DEFAULT_SPARQL_FORMATTING_SETTINGS }
}

/**
 * Save SPARQL formatting settings
 */
export function saveSparqlFormattingSettings(settings: SparqlFormattingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SPARQL_FORMATTING_SETTINGS, JSON.stringify(settings))
  } catch (error) {
    console.warn('Failed to save SPARQL formatting settings to localStorage:', error)
    throw error
  }
}
