import { describe, it, expect } from 'vitest'
import { detectQueryType, isSelectQuery, isConstructQuery, isAskQuery } from '../queryDetector'

describe('queryDetector', () => {
  describe('detectQueryType', () => {
    it('detects SELECT queries', () => {
      expect(detectQueryType('SELECT * WHERE { ?s ?p ?o }')).toBe('SELECT')
    })

    it('detects CONSTRUCT queries', () => {
      expect(detectQueryType('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')).toBe('CONSTRUCT')
    })

    it('detects DESCRIBE queries', () => {
      expect(detectQueryType('DESCRIBE <http://example.org/a>')).toBe('DESCRIBE')
    })

    it('detects ASK queries', () => {
      expect(detectQueryType('ASK { ?s ?p ?o }')).toBe('ASK')
    })

    it('handles prefixes and lowercase keywords', () => {
      expect(
        detectQueryType('PREFIX ex: <http://example.org/>\nselect ?s where { ?s a ex:Thing }')
      ).toBe('SELECT')
    })

    it('returns null for update operations', () => {
      expect(detectQueryType('INSERT DATA { <http://a> <http://b> <http://c> }')).toBeNull()
    })

    it('returns null for invalid SPARQL', () => {
      expect(detectQueryType('this is not sparql')).toBeNull()
      expect(detectQueryType('SELECT * WHERE {')).toBeNull()
    })
  })

  describe('helpers', () => {
    it('isSelectQuery', () => {
      expect(isSelectQuery('SELECT * WHERE { ?s ?p ?o }')).toBe(true)
      expect(isSelectQuery('ASK { ?s ?p ?o }')).toBe(false)
    })

    it('isConstructQuery is true for CONSTRUCT and DESCRIBE', () => {
      expect(isConstructQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')).toBe(true)
      expect(isConstructQuery('DESCRIBE <http://example.org/a>')).toBe(true)
      expect(isConstructQuery('SELECT * WHERE { ?s ?p ?o }')).toBe(false)
      expect(isConstructQuery('garbage')).toBe(false)
    })

    it('isAskQuery', () => {
      expect(isAskQuery('ASK { ?s ?p ?o }')).toBe(true)
      expect(isAskQuery('SELECT * WHERE { ?s ?p ?o }')).toBe(false)
    })
  })
})
