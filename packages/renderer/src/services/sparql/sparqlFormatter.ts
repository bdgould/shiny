/**
 * SPARQL Query Formatter
 * Formats SPARQL queries according to user preferences
 */

import { Parser, Generator } from 'sparqljs'
import type { SparqlFormattingSettings } from '@/services/preferences/appSettings'

const parser = new Parser()
const generator = new Generator()

/**
 * Format a SPARQL query according to the provided settings
 */
export function formatSparqlQuery(query: string, settings: SparqlFormattingSettings): string {
  try {
    // Parse the query
    const parsed = parser.parse(query)

    // Generate formatted query
    let formatted = generator.stringify(parsed)

    // Apply custom formatting based on settings
    formatted = applyFormattingRules(formatted, settings)

    return formatted
  } catch (error) {
    // If parsing fails, return original query
    console.error('Failed to format SPARQL query:', error)
    return query
  }
}

/**
 * Apply formatting rules to a generated SPARQL query
 */
function applyFormattingRules(query: string, settings: SparqlFormattingSettings): string {
  let result = query

  // Apply keyword case
  if (settings.keywordCase === 'uppercase') {
    result = applyUppercaseKeywords(result)
  } else {
    result = applyLowercaseKeywords(result)
  }

  // Apply rdf:type shorthand (after keyword case so 'a' gets proper casing)
  result = applyRdfTypeShorthand(result, settings)

  // Apply prefix alignment
  if (settings.alignPrefixes) {
    result = alignPrefixes(result)
  }

  // Apply brace style (before indentation and spacing)
  result = applyBraceStyle(result, settings)

  // Apply indentation
  result = applyIndentation(result, settings)

  // Apply spacing rules
  result = applySpacingRules(result, settings)

  // Apply line break rules
  result = applyLineBreakRules(result, settings)

  // Ensure clean line endings
  result = result.trim() + '\n'

  return result
}

/**
 * Convert SPARQL keywords to uppercase
 */
function applyUppercaseKeywords(query: string): string {
  const keywords = [
    'SELECT',
    'CONSTRUCT',
    'DESCRIBE',
    'ASK',
    'WHERE',
    'OPTIONAL',
    'UNION',
    'MINUS',
    'GRAPH',
    'FILTER',
    'BIND',
    'VALUES',
    'SERVICE',
    'PREFIX',
    'BASE',
    'DISTINCT',
    'REDUCED',
    'ORDER BY',
    'GROUP BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'FROM',
    'FROM NAMED',
    'AS',
    'A',
    'STR',
    'LANG',
    'LANGMATCHES',
    'DATATYPE',
    'BOUND',
    'IRI',
    'URI',
    'BNODE',
    'RAND',
    'ABS',
    'CEIL',
    'FLOOR',
    'ROUND',
    'CONCAT',
    'STRLEN',
    'UCASE',
    'LCASE',
    'ENCODE_FOR_URI',
    'CONTAINS',
    'STRSTARTS',
    'STRENDS',
    'STRBEFORE',
    'STRAFTER',
    'YEAR',
    'MONTH',
    'DAY',
    'HOURS',
    'MINUTES',
    'SECONDS',
    'TIMEZONE',
    'TZ',
    'NOW',
    'UUID',
    'STRUUID',
    'MD5',
    'SHA1',
    'SHA256',
    'SHA384',
    'SHA512',
    'COALESCE',
    'IF',
    'STRLANG',
    'STRDT',
    'SAMETERM',
    'ISIRI',
    'ISURI',
    'ISBLANK',
    'ISLITERAL',
    'ISNUMERIC',
    'REGEX',
    'SUBSTR',
    'REPLACE',
    'EXISTS',
    'NOT EXISTS',
    'COUNT',
    'SUM',
    'MIN',
    'MAX',
    'AVG',
    'SAMPLE',
    'GROUP_CONCAT',
    'SEPARATOR',
  ]

  let result = query
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    result = result.replace(regex, keyword.toUpperCase())
  }

  return result
}

/**
 * Convert SPARQL keywords to lowercase
 */
function applyLowercaseKeywords(query: string): string {
  const keywords = [
    'SELECT',
    'CONSTRUCT',
    'DESCRIBE',
    'ASK',
    'WHERE',
    'OPTIONAL',
    'UNION',
    'MINUS',
    'GRAPH',
    'FILTER',
    'BIND',
    'VALUES',
    'SERVICE',
    'PREFIX',
    'BASE',
    'DISTINCT',
    'REDUCED',
    'ORDER BY',
    'GROUP BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'FROM',
    'FROM NAMED',
    'AS',
    'A',
    'STR',
    'LANG',
    'LANGMATCHES',
    'DATATYPE',
    'BOUND',
    'IRI',
    'URI',
    'BNODE',
    'RAND',
    'ABS',
    'CEIL',
    'FLOOR',
    'ROUND',
    'CONCAT',
    'STRLEN',
    'UCASE',
    'LCASE',
    'ENCODE_FOR_URI',
    'CONTAINS',
    'STRSTARTS',
    'STRENDS',
    'STRBEFORE',
    'STRAFTER',
    'YEAR',
    'MONTH',
    'DAY',
    'HOURS',
    'MINUTES',
    'SECONDS',
    'TIMEZONE',
    'TZ',
    'NOW',
    'UUID',
    'STRUUID',
    'MD5',
    'SHA1',
    'SHA256',
    'SHA384',
    'SHA512',
    'COALESCE',
    'IF',
    'STRLANG',
    'STRDT',
    'SAMETERM',
    'ISIRI',
    'ISURI',
    'ISBLANK',
    'ISLITERAL',
    'ISNUMERIC',
    'REGEX',
    'SUBSTR',
    'REPLACE',
    'EXISTS',
    'NOT EXISTS',
    'COUNT',
    'SUM',
    'MIN',
    'MAX',
    'AVG',
    'SAMPLE',
    'GROUP_CONCAT',
    'SEPARATOR',
  ]

  let result = query
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    result = result.replace(regex, keyword.toLowerCase())
  }

  return result
}

/**
 * Align PREFIX declarations
 */
function alignPrefixes(query: string): string {
  const lines = query.split('\n')
  const prefixLines: string[] = []
  const otherLines: string[] = []

  // Separate PREFIX lines from other lines
  for (const line of lines) {
    if (line.trim().match(/^PREFIX\s+/i)) {
      prefixLines.push(line)
    } else {
      otherLines.push(line)
    }
  }

  if (prefixLines.length === 0) {
    return query
  }

  // Find the longest prefix name
  let maxPrefixLength = 0
  const prefixPattern = /^(PREFIX\s+)(\S+:)(\s+)(<.+>)/i
  const parsedPrefixes: Array<{ keyword: string; prefix: string; uri: string }> = []

  for (const line of prefixLines) {
    const match = line.match(prefixPattern)
    if (match) {
      const [, keyword, prefix, , uri] = match
      maxPrefixLength = Math.max(maxPrefixLength, (keyword + prefix).length)
      parsedPrefixes.push({ keyword, prefix, uri })
    }
  }

  // Rebuild PREFIX lines with alignment
  const alignedPrefixes = parsedPrefixes.map(({ keyword, prefix, uri }) => {
    const currentLength = (keyword + prefix).length
    const padding = ' '.repeat(maxPrefixLength - currentLength + 1)
    return `${keyword}${prefix}${padding}${uri}`
  })

  return [...alignedPrefixes, ...otherLines].join('\n')
}

/**
 * Apply rdf:type shorthand preference
 */
function applyRdfTypeShorthand(query: string, settings: SparqlFormattingSettings): string {
  let result = query

  if (settings.useRdfTypeShorthand) {
    // Determine the case for 'a' based on keyword case setting
    const aKeyword = settings.keywordCase === 'uppercase' ? 'A' : 'a'

    // Replace full rdf:type IRI with 'a' or 'A'
    result = result.replace(/<http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#type>/g, aKeyword)
    // Also handle prefixed version
    result = result.replace(/\brdf:type\b/g, aKeyword)
  }
  // If false, sparqljs already outputs full IRI, so no action needed

  return result
}

/**
 * Apply brace style (same-line vs new-line)
 */
function applyBraceStyle(query: string, settings: SparqlFormattingSettings): string {
  let result = query

  const keywords = ['CONSTRUCT', 'WHERE', 'OPTIONAL', 'GRAPH', 'UNION', 'MINUS']

  if (settings.braceStyle === 'new-line') {
    // Move opening braces to new line after keywords
    for (const keyword of keywords) {
      // Pattern: KEYWORD followed by optional space and opening brace
      const regex = new RegExp(`(${keyword})(\\s*)\\{`, 'gi')
      result = result.replace(regex, '$1\n{')
    }
  } else {
    // Ensure opening braces are on same line (remove newlines before braces)
    for (const keyword of keywords) {
      const regex = new RegExp(`(${keyword})\\s*\\n\\s*\\{`, 'gi')
      result = result.replace(regex, '$1 {')
    }
  }

  return result
}

/**
 * Apply indentation rules
 */
function applyIndentation(query: string, settings: SparqlFormattingSettings): string {
  const indent = settings.useTabs ? '\t' : ' '.repeat(settings.indentSize)

  // First, fix any malformed spacing from the generator (e.g., " WHERE" with single leading space)
  // This handles the sparqljs generator bug where subquery WHERE gets a single leading space
  const normalized = query.replace(
    /\n\s+(WHERE|SELECT|CONSTRUCT|DESCRIBE|ASK|OPTIONAL|UNION|MINUS|GRAPH|FILTER|BIND|VALUES)\s/gi,
    '\n$1 '
  )

  const lines = normalized.split('\n')
  let indentLevel = 0
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      result.push('')
      continue
    }

    // Decrease indent for closing braces
    if (line.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1)
    }

    // Add indentation
    result.push(indent.repeat(indentLevel) + line)

    // Increase indent for opening braces
    if (line.includes('{') && !line.includes('}')) {
      indentLevel++
    }
    // Handle same-line braces
    else if (line.includes('{') && line.includes('}')) {
      // No change in indent level
    }
  }

  return result.join('\n')
}

/**
 * Apply spacing rules
 */
function applySpacingRules(query: string, settings: SparqlFormattingSettings): string {
  let result = query

  // Space after commas
  if (settings.insertSpaces.afterCommas) {
    result = result.replace(/,(\S)/g, ', $1')
  } else {
    result = result.replace(/,\s+/g, ',')
  }

  // Space before opening braces
  if (settings.insertSpaces.beforeBraces) {
    result = result.replace(/(\S)\{/g, '$1 {')
  } else {
    result = result.replace(/\s+\{/g, '{')
  }

  // Space after opening braces (only if not followed by newline)
  if (settings.insertSpaces.afterBraces) {
    result = result.replace(/\{(\S)/g, '{ $1')
  }

  // Space before opening parentheses
  if (settings.insertSpaces.beforeParentheses) {
    result = result.replace(/(\w)\(/g, '$1 (')
  }

  // Space before statement separators (. and ;)
  if (settings.insertSpaces.beforeStatementSeparators) {
    // Add space before semicolon (always safe)
    result = result.replace(/([^\s])(;)/g, '$1 $2')
    // Add space before period only when it's a statement terminator
    // Match: word/variable/IRI/> followed by . at end of line or before newline
    result = result.replace(/([>\w?"])(\.)(\s*(?:\n|$))/gm, '$1 $2$3')
  } else {
    // Remove spaces before separators
    result = result.replace(/\s+(;)/g, '$1')
    result = result.replace(/\s+(\.)(\s*(?:\n|$))/gm, '$1$2')
  }

  return result
}

/**
 * Apply line break rules
 */
function applyLineBreakRules(query: string, settings: SparqlFormattingSettings): string {
  let result = query

  // Line break after each PREFIX (already handled by generator, just ensure it's there)
  if (settings.lineBreaks.afterPrefix) {
    result = result.replace(/(PREFIX\s+\S+:\s+<[^>]+>)\s*/gi, '$1\n')
  }

  // Blank line between PREFIXes and query
  if (settings.lineBreaks.betweenPrefixAndQuery) {
    // Add blank line after last PREFIX and before query keywords
    result = result.replace(
      /(PREFIX\s+\S+:\s+<[^>]+>\n)(\s*(?:SELECT|CONSTRUCT|DESCRIBE|ASK))/gi,
      '$1\n$2'
    )
  }

  // Line break after SELECT clause
  if (settings.lineBreaks.afterSelect) {
    result = result.replace(/(SELECT\s+(?:DISTINCT\s+)?[^{]+?)(\s*WHERE)/gi, '$1\n$2')
  }

  // Line break after WHERE clause (only if braceStyle allows it)
  if (settings.lineBreaks.afterWhere && settings.braceStyle === 'new-line') {
    result = result.replace(/(WHERE\s*)\{/gi, '$1\n{')
  }

  // Blank line between major clauses
  if (settings.lineBreaks.betweenClauses) {
    const clauseKeywords = ['OPTIONAL', 'UNION', 'FILTER', 'BIND', 'VALUES', 'SERVICE', 'GRAPH']
    for (const keyword of clauseKeywords) {
      const regex = new RegExp(`([^\\n])\\n(\\s*${keyword}\\s)`, 'gi')
      result = result.replace(regex, '$1\n\n$2')
    }
  }

  // Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n')

  return result
}
