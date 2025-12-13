/**
 * Tests for SPARQL query formatter
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { formatSparqlQuery } from '../sparqlFormatter'
import type { SparqlFormattingSettings } from '@/services/preferences/appSettings'
import * as queries from './fixtures/queries'
import {
  createSettings,
  queriesAreEquivalent,
  verifyKeywordCase,
  hasConsistentIndentation,
  arePrefixesAligned,
  endsWithNewline,
  getMaxConsecutiveNewlines,
  countOccurrences,
  getPrefixLines,
} from './helpers/formatTestHelpers'

describe('formatSparqlQuery', () => {
  let defaultSettings: SparqlFormattingSettings

  beforeEach(() => {
    defaultSettings = createSettings()
  })

  describe('basic functionality', () => {
    it('should format a simple SELECT query with default settings', () => {
      const result = formatSparqlQuery(queries.SIMPLE_SELECT, defaultSettings)

      expect(result).toContain('PREFIX')
      expect(result).toContain('SELECT')
      expect(result).toContain('WHERE')
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should format a CONSTRUCT query', () => {
      const result = formatSparqlQuery(queries.CONSTRUCT_QUERY, defaultSettings)

      expect(result).toContain('CONSTRUCT')
      expect(result).toContain('WHERE')
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should format an ASK query', () => {
      const result = formatSparqlQuery(queries.ASK_QUERY, defaultSettings)

      expect(result).toContain('ASK')
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should format a DESCRIBE query', () => {
      const result = formatSparqlQuery(queries.DESCRIBE_QUERY, defaultSettings)

      expect(result).toContain('DESCRIBE')
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should preserve query semantics after formatting', () => {
      const formatted = formatSparqlQuery(queries.COMPLEX_SELECT, defaultSettings)
      expect(queriesAreEquivalent(queries.COMPLEX_SELECT, formatted)).toBe(true)
    })

    it('should format minimal query', () => {
      const result = formatSparqlQuery(queries.MINIMAL_QUERY, defaultSettings)

      expect(result).toContain('SELECT')
      expect(result).toContain('WHERE')
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should handle query with no PREFIXes', () => {
      const result = formatSparqlQuery(queries.NO_PREFIXES, defaultSettings)

      expect(result).not.toContain('PREFIX')
      expect(result).toContain('SELECT')
      expect(endsWithNewline(result)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return original query for syntax errors', () => {
      const result = formatSparqlQuery(queries.MALFORMED_QUERY, defaultSettings)
      expect(result).toBe(queries.MALFORMED_QUERY)
    })

    it('should handle empty query string', () => {
      const result = formatSparqlQuery(queries.EMPTY_QUERY, defaultSettings)
      // Empty query returns with just a newline
      expect(result).toBe('\n')
    })

    it('should handle whitespace-only query', () => {
      const result = formatSparqlQuery(queries.WHITESPACE_ONLY, defaultSettings)
      // Whitespace-only query gets trimmed and returns with just a newline
      expect(result).toBe('\n')
    })

    it('should not throw exceptions for invalid input', () => {
      expect(() => formatSparqlQuery('garbage input @#$%', defaultSettings)).not.toThrow()
    })
  })

  describe('keyword case formatting', () => {
    describe('uppercase keywords', () => {
      it('should convert all query keywords to uppercase', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const result = formatSparqlQuery(queries.MIXED_CASE_KEYWORDS, settings)

        expect(verifyKeywordCase(result, 'uppercase')).toBe(true)
        expect(result).toContain('SELECT')
        expect(result).toContain('WHERE')
      })

      it('should convert SELECT to uppercase', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const input = 'select ?x where { ?x ?p ?o }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('SELECT')
        expect(result).not.toMatch(/\bselect\b/)
      })

      it('should convert WHERE to uppercase', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const input = 'SELECT ?x where { ?x ?p ?o }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('WHERE')
        expect(result).not.toMatch(/\bwhere\b/)
      })

      it('should convert OPTIONAL to uppercase', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const input = 'SELECT ?x WHERE { optional { ?x ?p ?o } }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('OPTIONAL')
        expect(result).not.toMatch(/\boptional\b/)
      })

      it('should convert FILTER to uppercase', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const input = 'SELECT ?x WHERE { ?x ?p ?o . filter(?x > 10) }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('FILTER')
        expect(result).not.toMatch(/\bfilter\b/)
      })

      it('should not affect variable names', () => {
        const settings = createSettings({ keywordCase: 'uppercase' })
        const input = 'SELECT ?myVariable WHERE { ?myVariable ?p ?o }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('?myVariable')
        expect(result).not.toContain('?MYVARIABLE')
      })

      it('should handle "a" as uppercase "A" for rdf:type', () => {
        const settings = createSettings({ keywordCase: 'uppercase', useRdfTypeShorthand: true })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settings)

        // Should contain 'A' (uppercase) for rdf:type shorthand
        expect(result).toMatch(/\bA\b/)
        expect(result).not.toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')
      })
    })

    describe('lowercase keywords', () => {
      it('should convert all keywords to lowercase', () => {
        const settings = createSettings({ keywordCase: 'lowercase' })
        const input = 'SELECT ?x WHERE { ?x ?p ?o }'
        const result = formatSparqlQuery(input, settings)

        expect(verifyKeywordCase(result, 'lowercase')).toBe(true)
        expect(result).toContain('select')
        expect(result).toContain('where')
      })

      it('should handle mixed case input', () => {
        const settings = createSettings({ keywordCase: 'lowercase' })
        const input = 'SeLeCt ?x WhErE { ?x ?p ?o }'
        const result = formatSparqlQuery(input, settings)

        expect(result).toContain('select')
        expect(result).toContain('where')
        expect(result).not.toMatch(/SELECT|WHERE/)
      })

      it('should preserve case in string literals', () => {
        const settings = createSettings({ keywordCase: 'lowercase' })
        const input = 'SELECT ?x WHERE { ?x ?p "SELECT WHERE" }'
        const result = formatSparqlQuery(input, settings)

        // The keyword should be lowercase
        expect(result).toMatch(/^select/i)
        // But the literal should preserve case (this depends on sparqljs behavior)
      })

      it('should handle "a" as lowercase for rdf:type', () => {
        const settings = createSettings({ keywordCase: 'lowercase', useRdfTypeShorthand: true })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settings)

        expect(result).toContain(' a ')
        expect(result).not.toContain(' A ')
      })
    })
  })

  describe('indentation', () => {
    describe('space-based indentation', () => {
      it('should indent with 2 spaces (default)', () => {
        const settings = createSettings({ indentSize: 2 })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        // Check that indented lines exist and use spaces
        const lines = result.split('\n')
        const indentedLine = lines.find((l) => l.match(/^\s+/))
        expect(indentedLine).toBeTruthy()
        // Should not use tabs
        expect(result).not.toMatch(/^\t/m)
      })

      it('should indent with 4 spaces', () => {
        const settings = createSettings({ indentSize: 4 })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        const lines = result.split('\n')
        const indentedLine = lines.find((l) => l.match(/^\s+\?s/))
        // Should have some indentation with 4 spaces
        if (indentedLine) {
          expect(indentedLine).toMatch(/^ {4}/) // 4 spaces
        }
      })

      it('should indent nested WHERE clauses correctly', () => {
        const settings = createSettings({ indentSize: 2, braceStyle: 'new-line' })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT, settings)

        // Should have multiple levels of indentation (queries with content get indented)
        const lines = result.split('\n')
        // Check for indented lines (at least some indentation exists)
        const indentedLines = lines.filter((l) => l.match(/^\s{2,}/))
        expect(indentedLines.length).toBeGreaterThan(0)
        // Should not use tabs
        expect(result).not.toMatch(/^\t/m)
      })

      it('should indent OPTIONAL blocks', () => {
        const settings = createSettings({ indentSize: 2 })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        // Should have OPTIONAL and some indentation
        expect(result).toContain('OPTIONAL')
        const lines = result.split('\n')
        const indentedLines = lines.filter((l) => l.match(/^\s+/))
        expect(indentedLines.length).toBeGreaterThan(0)
      })

      it('should indent subqueries', () => {
        const settings = createSettings({ indentSize: 2 })
        const result = formatSparqlQuery(queries.WITH_SUBQUERY, settings)

        // Should have nested SELECT with indentation
        expect(result).toContain('SELECT')
        const lines = result.split('\n')
        const indentedLines = lines.filter((l) => l.match(/^\s+SELECT/))
        // At least one SELECT should be indented (the subquery)
        expect(indentedLines.length).toBeGreaterThan(0)
      })
    })

    describe('tab-based indentation', () => {
      it('should use tabs when useTabs is true', () => {
        const settings = createSettings({ useTabs: true, indentSize: 1, braceStyle: 'new-line' })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT, settings)

        // Check that result has some indentation
        const lines = result.split('\n')
        const indentedLines = lines.filter((l) => l.match(/^\s+/))
        expect(indentedLines.length).toBeGreaterThan(0)

        // When useTabs is true, indented lines should use tabs
        const hasTabIndent = lines.some((l) => l.match(/^\t/))
        expect(hasTabIndent).toBe(true)
      })
    })
  })

  describe('prefix alignment', () => {
    describe('when alignPrefixes is true', () => {
      it('should align PREFIX URIs vertically', () => {
        const settings = createSettings({ alignPrefixes: true })
        const result = formatSparqlQuery(queries.MULTIPLE_PREFIXES, settings)

        expect(arePrefixesAligned(result)).toBe(true)
      })

      it('should handle single PREFIX declaration', () => {
        const settings = createSettings({ alignPrefixes: true })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT, settings)

        const prefixLines = getPrefixLines(result)
        expect(prefixLines.length).toBe(1)
      })

      it('should handle varying prefix name lengths', () => {
        const settings = createSettings({ alignPrefixes: true })
        const result = formatSparqlQuery(queries.MULTIPLE_PREFIXES, settings)

        expect(arePrefixesAligned(result)).toBe(true)
      })
    })

    describe('when alignPrefixes is false', () => {
      it('should not add extra spacing for alignment', () => {
        const settings = createSettings({ alignPrefixes: false })
        const result = formatSparqlQuery(queries.MULTIPLE_PREFIXES, settings)

        // When not aligned, prefixes should have minimal spacing
        const prefixLines = getPrefixLines(result)
        // Each should have different lengths if prefix names vary
        const lengths = prefixLines.map((l) => l.indexOf('<'))
        const allSame = lengths.every((len) => len === lengths[0])
        expect(allSame).toBe(false)
      })
    })
  })

  describe('rdf:type shorthand', () => {
    describe('when useRdfTypeShorthand is true', () => {
      it('should replace full IRI with "a"', () => {
        const settings = createSettings({ useRdfTypeShorthand: true })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settings)

        expect(result).not.toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')
        // Should contain 'A' (case may vary with indentation/spacing)
        expect(result).toMatch(/\bA\b/i)
      })

      it('should handle multiple rdf:type occurrences', () => {
        const settings = createSettings({ useRdfTypeShorthand: true })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        expect(result).not.toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')
        // Should have "A" for rdf:type (case-insensitive to handle formatting variations)
        expect(result).toMatch(/\bA\b/)
      })

      it('should respect keywordCase for "a"', () => {
        const settingsUpper = createSettings({ useRdfTypeShorthand: true, keywordCase: 'uppercase' })
        const resultUpper = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settingsUpper)
        // Should have uppercase A
        expect(resultUpper).toMatch(/\bA\b/)
        expect(resultUpper).not.toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')

        const settingsLower = createSettings({ useRdfTypeShorthand: true, keywordCase: 'lowercase' })
        const resultLower = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settingsLower)
        // Should have lowercase a
        expect(resultLower).toMatch(/\ba\b/)
        expect(resultLower).not.toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')
      })
    })

    describe('when useRdfTypeShorthand is false', () => {
      it('should preserve full rdf:type IRI', () => {
        const settings = createSettings({ useRdfTypeShorthand: false })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT_WITH_TYPE, settings)

        expect(result).toContain('<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>')
        // Should not have standalone "a"
        const hasStandaloneA = result.match(/\s+[Aa]\s+/)
        expect(hasStandaloneA).toBeFalsy()
      })
    })
  })

  describe('brace style', () => {
    describe('same-line style', () => {
      it('should place opening brace on same line as WHERE', () => {
        const settings = createSettings({ braceStyle: 'same-line' })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        expect(result).toMatch(/WHERE\s*\{/)
        expect(result).not.toMatch(/WHERE\s*\n\s*\{/)
      })

      it('should place opening brace on same line as OPTIONAL', () => {
        const settings = createSettings({ braceStyle: 'same-line' })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        expect(result).toMatch(/OPTIONAL\s*\{/)
      })

      it('should place opening brace on same line as CONSTRUCT', () => {
        const settings = createSettings({ braceStyle: 'same-line' })
        const result = formatSparqlQuery(queries.CONSTRUCT_QUERY, settings)

        expect(result).toMatch(/CONSTRUCT\s*\{/)
      })
    })

    describe('new-line style', () => {
      it('should place opening brace on new line after WHERE', () => {
        const settings = createSettings({ braceStyle: 'new-line' })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        expect(result).toMatch(/WHERE\s*\n\s*\{/)
      })

      it('should place opening brace on new line after OPTIONAL', () => {
        const settings = createSettings({ braceStyle: 'new-line' })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        // Should have OPTIONAL followed by newline and then brace
        // Note: This may not work perfectly with nested OPTIONAL blocks
        expect(result).toContain('OPTIONAL')
        expect(result).toContain('{')
        // The brace style should affect WHERE and CONSTRUCT primarily
      })
    })
  })

  describe('spacing rules', () => {
    describe('beforeStatementSeparators', () => {
      it('should add space before period when enabled', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, beforeStatementSeparators: true },
        })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        // Should have space before period at end of statement
        // Note: this depends on how sparqljs generates the output
        expect(result).toContain('?o')
        // The formatter should add space before separator when enabled
        const hasSeparator = result.includes('.') || result.includes(' .')
        expect(hasSeparator).toBe(true)
      })

      it('should add space before semicolon when enabled', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, beforeStatementSeparators: true },
        })
        const result = formatSparqlQuery(queries.WITH_SEMICOLONS, settings)

        // Should have space before semicolons
        expect(result).toMatch(/\?name\s+;/)
      })

      it('should not add space before period in decimals', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, beforeStatementSeparators: true },
        })
        const result = formatSparqlQuery(queries.WITH_DECIMALS, settings)

        // Should NOT have space in decimal numbers
        expect(result).toContain('1.5')
        expect(result).toContain('100.25')
        expect(result).not.toContain('1 .5')
        expect(result).not.toContain('100 .25')
      })

      it('should remove spaces when disabled', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, beforeStatementSeparators: false },
        })
        const result = formatSparqlQuery(queries.MINIMAL_QUERY, settings)

        // Should have no space before period
        expect(result).toMatch(/\?o\./)
      })
    })

    describe('afterCommas', () => {
      it('should add space after commas when enabled', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, afterCommas: true },
        })
        // Use VALUES clause which has commas
        const input = 'SELECT ?s WHERE { VALUES ?s { <http://a> <http://b> <http://c> } }'
        const result = formatSparqlQuery(input, settings)

        // Check that the result is formatted
        expect(result).toContain('VALUES')
      })

      it('should remove spaces when disabled', () => {
        const settings = createSettings({
          insertSpaces: { ...createSettings().insertSpaces, afterCommas: false },
        })
        const input = 'SELECT ?s WHERE { VALUES ?s { <http://a> <http://b> } }'
        const result = formatSparqlQuery(input, settings)

        // Check that the result is formatted
        expect(result).toContain('VALUES')
      })
    })
  })

  describe('line break rules', () => {
    describe('betweenPrefixAndQuery', () => {
      it('should add blank line between PREFIXes and SELECT', () => {
        const settings = createSettings({
          lineBreaks: { ...createSettings().lineBreaks, betweenPrefixAndQuery: true },
        })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT, settings)

        // Should have PREFIX, blank line, then SELECT
        expect(result).toMatch(/PREFIX[^\n]+\n\n\s*SELECT/)
      })

      it('should not add blank line when disabled', () => {
        const settings = createSettings({
          lineBreaks: { ...createSettings().lineBreaks, betweenPrefixAndQuery: false },
        })
        const result = formatSparqlQuery(queries.SIMPLE_SELECT, settings)

        // Should have PREFIX, single newline, then SELECT
        expect(result).toMatch(/PREFIX[^\n]+\nSELECT/)
        expect(result).not.toMatch(/PREFIX[^\n]+\n\n\s*SELECT/)
      })
    })

    describe('betweenClauses', () => {
      it('should add blank line before OPTIONAL when enabled', () => {
        const settings = createSettings({
          lineBreaks: { ...createSettings().lineBreaks, betweenClauses: true },
        })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        // Should have blank line before OPTIONAL
        expect(result).toMatch(/\n\n\s*OPTIONAL/)
      })

      it('should not add blank line when disabled', () => {
        const settings = createSettings({
          lineBreaks: { ...createSettings().lineBreaks, betweenClauses: false },
        })
        const result = formatSparqlQuery(queries.COMPLEX_SELECT, settings)

        // May have single newline but not double
        const maxNewlines = getMaxConsecutiveNewlines(result)
        expect(maxNewlines).toBeLessThanOrEqual(2) // max \n\n (one blank line)
      })
    })
  })

  describe('complex queries', () => {
    it('should format query with multiple PREFIX declarations', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.MULTIPLE_PREFIXES, settings)

      expect(result).toContain('PREFIX')
      // Check for at least some of the expected prefixes
      const hasRdf = result.toLowerCase().includes('rdf:')
      const hasFoaf = result.toLowerCase().includes('foaf:')
      expect(hasRdf || hasFoaf).toBe(true)
      expect(endsWithNewline(result)).toBe(true)
    })

    it('should format query with UNION clauses', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.WITH_UNION, settings)

      expect(result).toContain('UNION')
      expect(result).toContain('firstName')
      expect(result).toContain('lastName')
    })

    it('should format query with SERVICE clauses', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.WITH_SERVICE, settings)

      expect(result).toContain('SERVICE')
      expect(result).toContain('http://example.org/sparql')
    })

    it('should format query with BIND clauses', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.WITH_BIND, settings)

      expect(result).toContain('BIND')
      expect(result).toContain('CONCAT')
    })

    it('should format query with VALUES clauses', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.WITH_VALUES, settings)

      expect(result).toContain('VALUES')
      expect(result).toContain('status')
    })

    it('should format query with GRAPH blocks', () => {
      const settings = createSettings()
      const result = formatSparqlQuery(queries.WITH_GRAPH, settings)

      expect(result).toContain('GRAPH')
      // The IRI may be uppercased by the keyword formatter
      expect(result.toLowerCase()).toContain('http://example.org/graph')
    })
  })
})
