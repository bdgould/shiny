/**
 * Tool executor for AI chat assistant
 * Dispatches tool calls to appropriate handlers
 */

import type { ToolCall } from '../../types/aiChat'
import type { OntologyElementType, CacheSearchResult, AnyOntologyElement } from '../../types/ontologyCache'
import { useOntologyCacheStore } from '../../stores/ontologyCache'

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Context for tool execution - passed from the component
 */
export interface ToolExecutionContext {
  backendId: string | null
}

/**
 * Execute a tool call and return the result
 * @param toolCall The tool call to execute
 * @param context Execution context including the backend ID from the active tab
 */
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { name, arguments: args } = toolCall
  const { backendId } = context

  switch (name) {
    case 'searchOntology':
      return executeSearchOntology(args, backendId)
    case 'listOntologyElements':
      return executeListOntologyElements(args, backendId)
    case 'getClassDetails':
      return executeGetClassDetails(args, backendId)
    case 'getPropertyDetails':
      return executeGetPropertyDetails(args, backendId)
    case 'runSparqlQuery':
      return executeRunSparqlQuery(args, backendId)
    default:
      return {
        success: false,
        error: `Unknown tool: ${name}`
      }
  }
}

/**
 * Search ontology for elements matching query
 */
async function executeSearchOntology(
  args: Record<string, unknown>,
  backendId: string | null
): Promise<ToolExecutionResult> {
  try {
    const ontologyCacheStore = useOntologyCacheStore()

    if (!backendId) {
      return {
        success: false,
        error: 'No backend selected for the current query tab'
      }
    }

    const query = String(args.query || '')
    if (!query) {
      return {
        success: false,
        error: 'Query parameter is required'
      }
    }

    // Parse types parameter
    let types: OntologyElementType[] | undefined
    if (args.types) {
      const typeStr = String(args.types)
      types = typeStr.split(',').map((t) => t.trim()) as OntologyElementType[]
    }

    // Parse limit
    let limit = 10
    if (args.limit) {
      limit = Math.min(50, Math.max(1, parseInt(String(args.limit), 10) || 10))
    }

    const results = await ontologyCacheStore.searchElements(backendId, {
      query,
      types,
      limit
    })

    // Format results for AI consumption
    const formattedResults = results.map((r: CacheSearchResult) => ({
      iri: r.element.iri,
      label: r.element.label,
      type: r.element.type,
      description: r.element.description,
      matchedField: r.matchedField,
      score: r.score
    }))

    return {
      success: true,
      result: {
        count: formattedResults.length,
        results: formattedResults
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    }
  }
}

/**
 * List ontology elements with pagination
 */
async function executeListOntologyElements(
  args: Record<string, unknown>,
  backendId: string | null
): Promise<ToolExecutionResult> {
  try {
    const ontologyCacheStore = useOntologyCacheStore()

    if (!backendId) {
      return {
        success: false,
        error: 'No backend selected for the current query tab'
      }
    }

    const elementType = String(args.type || '')
    if (!elementType || !['class', 'property', 'individual'].includes(elementType)) {
      return {
        success: false,
        error: 'Type parameter must be one of: class, property, individual'
      }
    }

    // Parse pagination parameters
    const page = Math.max(1, parseInt(String(args.page || '1'), 10) || 1)
    const pageSize = Math.min(1000, Math.max(1, parseInt(String(args.pageSize || '20'), 10) || 20))
    const offset = (page - 1) * pageSize

    // Get cache for the backend
    const cache = ontologyCacheStore.getCache(backendId)
    if (!cache) {
      return {
        success: false,
        error: 'Ontology cache not available. Please refresh the cache first.'
      }
    }

    // Get the appropriate array based on type
    let elements: AnyOntologyElement[] = []
    let totalCount = 0

    if (elementType === 'class') {
      elements = cache.classes
      totalCount = cache.classes.length
    } else if (elementType === 'property') {
      elements = cache.properties
      totalCount = cache.properties.length
    } else if (elementType === 'individual') {
      elements = cache.individuals
      totalCount = cache.individuals.length
    }

    // Apply pagination
    const pagedElements = elements.slice(offset, offset + pageSize)
    const totalPages = Math.ceil(totalCount / pageSize)
    const hasMore = page < totalPages

    // Format results for AI consumption
    const formattedResults = pagedElements.map((element) => formatElement(element))

    return {
      success: true,
      result: {
        type: elementType,
        page,
        pageSize,
        totalCount,
        totalPages,
        hasMore,
        count: formattedResults.length,
        elements: formattedResults
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list ontology elements'
    }
  }
}

/**
 * Get details about a specific class
 */
async function executeGetClassDetails(
  args: Record<string, unknown>,
  backendId: string | null
): Promise<ToolExecutionResult> {
  try {
    const ontologyCacheStore = useOntologyCacheStore()

    if (!backendId) {
      return {
        success: false,
        error: 'No backend selected for the current query tab'
      }
    }

    const iri = String(args.iri || '')
    if (!iri) {
      return {
        success: false,
        error: 'IRI parameter is required'
      }
    }

    const element = await ontologyCacheStore.getElementByIri(
      backendId,
      iri,
      'class'
    )

    if (!element) {
      return {
        success: true,
        result: { found: false, message: `No class found with IRI: ${iri}` }
      }
    }

    return {
      success: true,
      result: {
        found: true,
        class: formatElement(element)
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get class details'
    }
  }
}

/**
 * Get details about a specific property
 */
async function executeGetPropertyDetails(
  args: Record<string, unknown>,
  backendId: string | null
): Promise<ToolExecutionResult> {
  try {
    const ontologyCacheStore = useOntologyCacheStore()

    if (!backendId) {
      return {
        success: false,
        error: 'No backend selected for the current query tab'
      }
    }

    const iri = String(args.iri || '')
    if (!iri) {
      return {
        success: false,
        error: 'IRI parameter is required'
      }
    }

    const element = await ontologyCacheStore.getElementByIri(
      backendId,
      iri,
      'property'
    )

    if (!element) {
      return {
        success: true,
        result: { found: false, message: `No property found with IRI: ${iri}` }
      }
    }

    return {
      success: true,
      result: {
        found: true,
        property: formatElement(element)
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get property details'
    }
  }
}

/**
 * Execute a SPARQL query (called only after user approval)
 */
async function executeRunSparqlQuery(
  args: Record<string, unknown>,
  backendId: string | null
): Promise<ToolExecutionResult> {
  try {
    if (!backendId) {
      return {
        success: false,
        error: 'No backend selected for the current query tab'
      }
    }

    let query = String(args.query || '')
    if (!query) {
      return {
        success: false,
        error: 'Query parameter is required'
      }
    }

    // Apply limit override if specified
    if (args.limit) {
      const limit = Math.min(100, Math.max(1, parseInt(String(args.limit), 10) || 100))
      // Simple check if query already has LIMIT
      if (!/\bLIMIT\s+\d+/i.test(query)) {
        query = `${query.trim()}\nLIMIT ${limit}`
      }
    } else {
      // Ensure there's a safety limit if none specified
      if (!/\bLIMIT\s+\d+/i.test(query)) {
        query = `${query.trim()}\nLIMIT 100`
      }
    }

    // Execute query via Electron API
    // Note: API signature is (query, backendId) - query first, then backendId
    const result = await window.electronAPI.query.execute(query, backendId)

    // Format result for AI consumption
    if (result.type === 'select') {
      return {
        success: true,
        result: {
          type: 'select',
          rowCount: result.data?.results?.bindings?.length || 0,
          columns: result.data?.head?.vars || [],
          rows: (result.data?.results?.bindings || []).slice(0, 20).map((binding: Record<string, { value: string }>) => {
            const row: Record<string, string> = {}
            for (const [key, val] of Object.entries(binding)) {
              row[key] = val.value
            }
            return row
          }),
          truncated: (result.data?.results?.bindings?.length || 0) > 20
        }
      }
    } else if (result.type === 'construct' || result.type === 'describe') {
      return {
        success: true,
        result: {
          type: result.type,
          tripleCount: Array.isArray(result.data) ? result.data.length : 0
        }
      }
    } else if (result.type === 'ask') {
      return {
        success: true,
        result: {
          type: 'ask',
          answer: result.data
        }
      }
    }

    return {
      success: true,
      result: {
        type: result.type,
        data: result.data
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Query execution failed'
    }
  }
}

/**
 * Format an ontology element for AI consumption
 */
function formatElement(element: AnyOntologyElement): Record<string, unknown> {
  const base: Record<string, unknown> = {
    iri: element.iri,
    localName: element.localName,
    label: element.label,
    description: element.description,
    type: element.type
  }

  // Add property-specific fields
  if ('propertyType' in element) {
    base.propertyType = element.propertyType
    base.domain = element.domain
    base.range = element.range
  }

  // Add individual-specific fields
  if ('classIri' in element) {
    base.classIri = element.classIri
  }

  return base
}
