/**
 * AI Tool definitions for the chat assistant
 * These tools allow the AI to search ontology and execute SPARQL queries
 */

import type { OpenAITool } from '../../types/aiChat'

/**
 * Tool: Search ontology for classes, properties, or individuals
 */
export const searchOntologyTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'searchOntology',
    description:
      'Search the ontology cache for classes, properties, or individuals by keyword. ' +
      'Use this to find IRIs, labels, and descriptions of ontology elements that might be ' +
      'relevant to the user\'s query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search term to look for in IRIs, labels, and descriptions'
        },
        types: {
          type: 'string',
          description: 'Comma-separated list of element types to search: class, property, individual. ' +
            'If not specified, searches all types.',
          enum: ['class', 'property', 'individual', 'class,property', 'class,individual', 'property,individual', 'class,property,individual']
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results to return (default: 10, max: 50)'
        }
      },
      required: ['query']
    }
  }
}

/**
 * Tool: Get details about a specific class by IRI
 */
export const getClassDetailsTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'getClassDetails',
    description:
      'Get detailed information about a specific OWL class by its IRI. ' +
      'Returns the class label, description, and other metadata if available.',
    parameters: {
      type: 'object',
      properties: {
        iri: {
          type: 'string',
          description: 'The full IRI of the class to look up'
        }
      },
      required: ['iri']
    }
  }
}

/**
 * Tool: Get details about a specific property by IRI
 */
export const getPropertyDetailsTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'getPropertyDetails',
    description:
      'Get detailed information about a specific OWL property by its IRI. ' +
      'Returns the property type (object/datatype/annotation), label, description, domain, and range.',
    parameters: {
      type: 'object',
      properties: {
        iri: {
          type: 'string',
          description: 'The full IRI of the property to look up'
        }
      },
      required: ['iri']
    }
  }
}

/**
 * Tool: List ontology elements (classes, properties, individuals)
 */
export const listOntologyElementsTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'listOntologyElements',
    description:
      'List classes, properties, or individuals from the ontology cache. ' +
      'Use this to browse the ontology without searching. Results are paginated. ' +
      'Call with increasing page numbers to get more results.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'The type of elements to list',
          enum: ['class', 'property', 'individual']
        },
        page: {
          type: 'string',
          description: 'Page number (1-based, default: 1). Each page returns up to 20 items.'
        },
        pageSize: {
          type: 'string',
          description: 'Number of items per page (default: 20, max: 1000)'
        }
      },
      required: ['type']
    }
  }
}

/**
 * Tool: Execute a SPARQL query (requires user approval)
 */
export const runSparqlQueryTool: OpenAITool = {
  type: 'function',
  function: {
    name: 'runSparqlQuery',
    description:
      'Execute a SPARQL query against the connected backend. ' +
      'IMPORTANT: This action requires user approval before execution. ' +
      'Use this tool to test queries, validate syntax, or gather data from the knowledge graph.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SPARQL query to execute'
        },
        limit: {
          type: 'string',
          description: 'Optional LIMIT clause override (max 100 results for safety)'
        }
      },
      required: ['query']
    }
  }
}

/**
 * All available tools for the AI assistant
 */
export const aiTools: OpenAITool[] = [
  searchOntologyTool,
  listOntologyElementsTool,
  getClassDetailsTool,
  getPropertyDetailsTool,
  runSparqlQueryTool
]

/**
 * Tools that require user approval before execution
 */
export const toolsRequiringApproval = new Set(['runSparqlQuery'])

/**
 * Check if a tool requires user approval
 */
export function requiresApproval(toolName: string): boolean {
  return toolsRequiringApproval.has(toolName)
}
