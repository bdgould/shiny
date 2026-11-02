/**
 * Utilities for serializing SPARQL query results to various formats
 */

import type { QueryType } from '@/services/sparql/queryDetector'
import { rdfProcessor } from '@/services/rdf/rdfProcessor'

/** File extension for each export format value. */
export const FORMAT_EXTENSIONS: Record<string, string> = {
  csv: 'csv',
  tsv: 'tsv',
  json: 'json',
  xml: 'xml',
  markdown: 'md',
  turtle: 'ttl',
  trig: 'trig',
  ntriples: 'nt',
  nquads: 'nq',
  jsonld: 'jsonld',
}

/** Human-readable label for each export format value. */
export const FORMAT_LABELS: Record<string, string> = {
  csv: 'CSV',
  tsv: 'TSV',
  json: 'JSON',
  xml: 'SPARQL XML',
  markdown: 'Markdown table',
  turtle: 'Turtle',
  trig: 'TriG',
  ntriples: 'N-Triples',
  nquads: 'N-Quads',
  jsonld: 'JSON-LD',
}

interface Binding {
  type?: string
  value?: string
  datatype?: string
  'xml:lang'?: string
}

interface SelectData {
  head: { vars?: string[] }
  results: { bindings?: Record<string, Binding>[] }
}

function selectData(results: any): SelectData {
  const data = results.data || results
  if (!data || !data.head || !data.results) {
    throw new Error('Invalid SELECT query results format')
  }
  return data
}

/**
 * Serialize SELECT query results to CSV format
 */
export function serializeToCSV(results: any): string {
  // Extract the actual SPARQL JSON results data
  const data = results.data || results

  if (!data || !data.head || !data.results) {
    throw new Error('Invalid SELECT query results format')
  }

  const variables = data.head.vars || []
  const bindings = data.results.bindings || []

  if (variables.length === 0) {
    return ''
  }

  // Header row
  const header = variables.join(',')

  // Data rows
  const rows = bindings.map((binding: any) => {
    return variables
      .map((variable: string) => {
        const value = binding[variable]
        if (!value) return ''

        // Get the actual value
        let cellValue = value.value || ''

        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (cellValue.includes(',') || cellValue.includes('\n') || cellValue.includes('"')) {
          cellValue = '"' + cellValue.replace(/"/g, '""') + '"'
        }

        return cellValue
      })
      .join(',')
  })

  return [header, ...rows].join('\n')
}

/**
 * A binding term in the SPARQL 1.1 TSV encoding: IRIs in angle brackets,
 * blank nodes as `_:label`, literals quoted with their language or datatype.
 * Tabs, newlines and backslashes inside literals are escaped.
 */
export function tsvTerm(binding: Binding | undefined): string {
  if (!binding || binding.value === undefined) return ''
  const value = binding.value
  switch (binding.type) {
    case 'uri':
      return `<${value}>`
    case 'bnode':
      return `_:${value}`
    default: {
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
      if (binding['xml:lang']) return `"${escaped}"@${binding['xml:lang']}`
      if (binding.datatype) return `"${escaped}"^^<${binding.datatype}>`
      return `"${escaped}"`
    }
  }
}

/**
 * Serialize SELECT query results to the SPARQL 1.1 TSV format
 */
export function serializeToTSV(results: any): string {
  const data = selectData(results)
  const variables = data.head.vars || []
  const bindings = data.results.bindings || []
  if (variables.length === 0) return ''

  const header = variables.map((v) => `?${v}`).join('\t')
  const rows = bindings.map((binding) => variables.map((v) => tsvTerm(binding[v])).join('\t'))
  return [header, ...rows].join('\n')
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xmlTerm(binding: Binding): string {
  const value = escapeXml(binding.value ?? '')
  switch (binding.type) {
    case 'uri':
      return `<uri>${value}</uri>`
    case 'bnode':
      return `<bnode>${value}</bnode>`
    default: {
      const lang = binding['xml:lang'] ? ` xml:lang="${escapeXml(binding['xml:lang'])}"` : ''
      const datatype = binding.datatype ? ` datatype="${escapeXml(binding.datatype)}"` : ''
      return `<literal${lang}${datatype}>${value}</literal>`
    }
  }
}

const XML_HEADER = '<?xml version="1.0"?>\n<sparql xmlns="http://www.w3.org/2005/sparql-results#">'

/**
 * Serialize SELECT query results to the SPARQL Query Results XML format
 */
export function serializeToSparqlXML(results: any): string {
  const data = selectData(results)
  const variables = data.head.vars || []
  const bindings = data.results.bindings || []

  const lines = [XML_HEADER, '  <head>']
  for (const v of variables) lines.push(`    <variable name="${escapeXml(v)}"/>`)
  lines.push('  </head>', '  <results>')
  for (const row of bindings) {
    lines.push('    <result>')
    for (const v of variables) {
      const binding = row[v]
      if (!binding) continue
      lines.push(`      <binding name="${escapeXml(v)}">${xmlTerm(binding)}</binding>`)
    }
    lines.push('    </result>')
  }
  lines.push('  </results>', '</sparql>')
  return lines.join('\n')
}

/**
 * Serialize ASK query results to the SPARQL Query Results XML format
 */
export function serializeAskToSparqlXML(results: any): string {
  const data = results.data || results
  const value = data?.boolean === true ? 'true' : 'false'
  return [XML_HEADER, '  <head/>', `  <boolean>${value}</boolean>`, '</sparql>'].join('\n')
}

/**
 * Serialize SELECT query results to a GitHub-flavoured Markdown table.
 * Pipes and newlines inside cells are escaped so the table stays intact.
 */
export function serializeToMarkdown(results: any): string {
  const data = selectData(results)
  const variables = data.head.vars || []
  const bindings = data.results.bindings || []
  if (variables.length === 0) return ''

  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`
  const lines = [row(variables.map(cell)), row(variables.map(() => '---'))]
  for (const binding of bindings) {
    lines.push(row(variables.map((v) => cell(binding[v]?.value ?? ''))))
  }
  return lines.join('\n')
}

/**
 * Serialize SELECT query results to JSON format
 */
export function serializeToJSON(results: any): string {
  // Extract the actual data, or use results as-is if it's already the data
  const data = results.data || results
  return JSON.stringify(data, null, 2)
}

/**
 * Serialize ASK query results to JSON format
 */
export function serializeAskToJSON(results: any): string {
  // Extract the actual data, or use results as-is if it's already the data
  const data = results.data || results
  return JSON.stringify(data, null, 2)
}

/**
 * Get available formats for a given query type
 */
export function getAvailableFormats(
  queryType: QueryType | null
): Array<{ value: string; label: string }> {
  switch (queryType) {
    case 'SELECT':
      return formats('csv', 'tsv', 'json', 'xml', 'markdown')
    case 'CONSTRUCT':
    case 'DESCRIBE':
      return formats('turtle', 'trig', 'ntriples', 'nquads', 'jsonld')
    case 'ASK':
      return formats('json', 'xml')
    default:
      return []
  }
}

function formats(...values: string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: FORMAT_LABELS[value] }))
}

/**
 * Serialize results based on query type and format
 *
 * @param results - The query results
 * @param queryType - The type of SPARQL query
 * @param format - The desired output format
 * @returns Serialized content as string
 */
export async function serializeResults(
  results: any,
  queryType: QueryType,
  format: string
): Promise<string> {
  if (!results) {
    throw new Error('No results to serialize')
  }

  switch (queryType) {
    case 'SELECT':
      switch (format) {
        case 'csv':
          return serializeToCSV(results)
        case 'tsv':
          return serializeToTSV(results)
        case 'json':
          return serializeToJSON(results)
        case 'xml':
          return serializeToSparqlXML(results)
        case 'markdown':
          return serializeToMarkdown(results)
        default:
          throw new Error(`Unsupported format "${format}" for SELECT query`)
      }

    case 'ASK':
      switch (format) {
        case 'json':
          return serializeAskToJSON(results)
        case 'xml':
          return serializeAskToSparqlXML(results)
        default:
          throw new Error(`Unsupported format "${format}" for ASK query`)
      }

    case 'CONSTRUCT':
    case 'DESCRIBE': {
      // For CONSTRUCT/DESCRIBE, results.data contains Turtle RDF from the backend
      let turtleData: string

      if (typeof results === 'string') {
        turtleData = results
      } else if (results.data && typeof results.data === 'string') {
        turtleData = results.data
      } else if (results.value && typeof results.value === 'string') {
        turtleData = results.value
      } else {
        throw new Error('CONSTRUCT/DESCRIBE results are not in expected format')
      }

      // If requesting Turtle format, return as-is
      if (format === 'turtle') {
        return turtleData
      }

      // For other formats, parse and re-serialize
      const dataset = await rdfProcessor.parseTurtle(turtleData)

      switch (format) {
        case 'trig':
          // Every Turtle document is a valid TriG document (TriG is a
          // superset), and CONSTRUCT results carry no named graphs, so the
          // Turtle serialization is the correct TriG output.
          return rdfProcessor.serializeToTurtle(dataset)
        case 'ntriples':
          return rdfProcessor.serializeToNTriples(dataset)
        case 'nquads':
          return rdfProcessor.serializeToNQuads(dataset)
        case 'jsonld':
          return rdfProcessor.serializeToJsonLD(dataset)
        default:
          throw new Error(`Unsupported format "${format}" for CONSTRUCT/DESCRIBE query`)
      }
    }

    default:
      throw new Error(`Unsupported query type: ${queryType}`)
  }
}
