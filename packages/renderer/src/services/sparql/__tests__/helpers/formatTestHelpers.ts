/**
 * Test helper functions for SPARQL formatter tests
 */

import { Parser } from 'sparqljs'
import type { SparqlFormattingSettings } from '@/services/preferences/appSettings'

/**
 * Verify that two queries are semantically equivalent
 * by comparing their parsed ASTs
 */
export function queriesAreEquivalent(query1: string, query2: string): boolean {
  const parser = new Parser()
  try {
    const ast1 = parser.parse(query1)
    const ast2 = parser.parse(query2)
    return JSON.stringify(ast1) === JSON.stringify(ast2)
  } catch {
    return false
  }
}

/**
 * Create a partial settings object merged with defaults
 */
export function createSettings(
  overrides: Partial<SparqlFormattingSettings> = {}
): SparqlFormattingSettings {
  const defaults: SparqlFormattingSettings = {
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

  return {
    ...defaults,
    ...overrides,
    insertSpaces: {
      ...defaults.insertSpaces,
      ...(overrides.insertSpaces || {}),
    },
    lineBreaks: {
      ...defaults.lineBreaks,
      ...(overrides.lineBreaks || {}),
    },
  }
}

/**
 * Count occurrences of a substring in a string
 */
export function countOccurrences(str: string, substr: string): number {
  return (str.match(new RegExp(substr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
}

/**
 * Get indentation level of a line (number of leading spaces/tabs)
 */
export function getIndentLevel(line: string, useTabs: boolean, indentSize: number): number {
  const match = line.match(/^(\s+)/)
  if (!match) return 0

  if (useTabs) {
    return match[1].replace(/ /g, '').length
  } else {
    return match[1].length / indentSize
  }
}

/**
 * Verify that all keywords in a query match the specified case
 */
export function verifyKeywordCase(query: string, expectedCase: 'uppercase' | 'lowercase'): boolean {
  const keywords = [
    'SELECT',
    'WHERE',
    'OPTIONAL',
    'FILTER',
    'BIND',
    'UNION',
    'CONSTRUCT',
    'ASK',
    'DESCRIBE',
  ]

  for (const keyword of keywords) {
    const expected = expectedCase === 'uppercase' ? keyword : keyword.toLowerCase()
    const opposite = expectedCase === 'uppercase' ? keyword.toLowerCase() : keyword

    // If the query contains this keyword
    if (query.toUpperCase().includes(keyword)) {
      // Check if it appears in the wrong case
      const wrongCaseRegex = new RegExp(`\\b${opposite}\\b`)
      if (wrongCaseRegex.test(query)) {
        return false
      }
    }
  }

  return true
}

/**
 * Extract all lines matching a pattern
 */
export function extractLines(query: string, pattern: RegExp): string[] {
  return query.split('\n').filter((line) => pattern.test(line))
}

/**
 * Check if query has consistent indentation
 */
export function hasConsistentIndentation(
  query: string,
  indentSize: number,
  useTabs: boolean
): boolean {
  const lines = query.split('\n').filter((l) => l.trim())

  for (const line of lines) {
    const leadingWhitespace = line.match(/^(\s*)/)?.[1] || ''
    if (leadingWhitespace && leadingWhitespace.length > 0) {
      // Check if it's a multiple of indent size
      if (useTabs) {
        if (leadingWhitespace.includes(' ')) return false
      } else {
        if (leadingWhitespace.length % indentSize !== 0) return false
        // Also check for tabs when we expect spaces
        if (leadingWhitespace.includes('\t')) return false
      }
    }
  }

  return true
}

/**
 * Count the number of blank lines in a query
 */
export function countBlankLines(query: string): number {
  return query.split('\n').filter((line) => line.trim() === '').length
}

/**
 * Check if a query contains a pattern
 */
export function containsPattern(query: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return query.includes(pattern)
  }
  return pattern.test(query)
}

/**
 * Get all PREFIX lines from a query
 */
export function getPrefixLines(query: string): string[] {
  return query.split('\n').filter((line) => line.trim().match(/^PREFIX\s+/i))
}

/**
 * Check if PREFIX declarations are aligned
 */
export function arePrefixesAligned(query: string): boolean {
  const prefixLines = getPrefixLines(query)
  if (prefixLines.length <= 1) return true

  const positions: number[] = []
  for (const line of prefixLines) {
    const match = line.match(/^PREFIX\s+\S+:\s+/)
    if (match) {
      positions.push(match[0].length)
    }
  }

  // Check if all positions are the same
  return positions.every((pos) => pos === positions[0])
}

/**
 * Check if a query ends with a newline
 */
export function endsWithNewline(query: string): boolean {
  return query.endsWith('\n')
}

/**
 * Get the number of consecutive newlines at maximum
 */
export function getMaxConsecutiveNewlines(query: string): number {
  const matches = query.match(/\n+/g)
  if (!matches) return 0
  return Math.max(...matches.map((m) => m.length))
}
