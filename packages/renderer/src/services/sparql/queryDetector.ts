import { Parser } from 'sparqljs'

export type QueryType = 'SELECT' | 'CONSTRUCT' | 'DESCRIBE' | 'ASK'

const parser = new Parser()

/**
 * Detects the SPARQL query type by parsing the query string
 * @param query - SPARQL query string
 * @returns Query type or null if parsing fails
 */
export function detectQueryType(query: string): QueryType | null {
  try {
    const parsed = parser.parse(query)
    const type = parsed.queryType?.toUpperCase()

    if (type === 'SELECT' || type === 'CONSTRUCT' || type === 'DESCRIBE' || type === 'ASK') {
      return type as QueryType
    }

    return null
  } catch {
    return null
  }
}

/**
 * Check if query is a SELECT query
 */
export function isSelectQuery(query: string): boolean {
  return detectQueryType(query) === 'SELECT'
}

/**
 * Check if query is a CONSTRUCT or DESCRIBE query (both return RDF graphs)
 */
export function isConstructQuery(query: string): boolean {
  const type = detectQueryType(query)
  return type === 'CONSTRUCT' || type === 'DESCRIBE'
}

/**
 * Check if query is an ASK query
 */
export function isAskQuery(query: string): boolean {
  return detectQueryType(query) === 'ASK'
}
