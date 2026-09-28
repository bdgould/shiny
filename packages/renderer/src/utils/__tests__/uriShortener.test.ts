import { describe, it, expect } from 'vitest'
import { shortenURI, isURI } from '../uriShortener'

describe('uriShortener', () => {
  describe('shortenURI', () => {
    it.each([
      ['http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'rdf:type'],
      ['http://www.w3.org/2000/01/rdf-schema#label', 'rdfs:label'],
      ['http://www.w3.org/2002/07/owl#Class', 'owl:Class'],
      ['http://www.w3.org/2001/XMLSchema#string', 'xsd:string'],
      ['http://xmlns.com/foaf/0.1/name', 'foaf:name'],
      ['http://purl.org/dc/terms/created', 'dct:created'],
      ['http://www.w3.org/2004/02/skos/core#prefLabel', 'skos:prefLabel'],
      ['http://schema.org/Person', 'schema:Person'],
      ['http://www.w3.org/ns/dcat#Dataset', 'dcat:Dataset'],
    ])('replaces known namespace in %s', (uri, expected) => {
      expect(shortenURI(uri)).toBe(expected)
    })

    it('abbreviates unknown URIs to their local name after the last slash', () => {
      expect(shortenURI('http://example.org/people/alice')).toBe('.../alice')
    })

    it('abbreviates unknown URIs to their local name after the last hash', () => {
      expect(shortenURI('http://example.org/vocab#Thing')).toBe('...#Thing')
    })

    it('returns the original URI when it ends with a separator', () => {
      expect(shortenURI('http://example.org/')).toBe('http://example.org/')
      expect(shortenURI('http://example.org/vocab#')).toBe('http://example.org/vocab#')
    })

    it('returns the original string when there is no separator', () => {
      expect(shortenURI('urn:isbn:12345')).toBe('urn:isbn:12345')
      expect(shortenURI('')).toBe('')
    })
  })

  describe('isURI', () => {
    it.each(['http://a.org', 'https://a.org', 'urn:uuid:1', 'ftp://files.org'])(
      'recognises %s',
      (v) => {
        expect(isURI(v)).toBe(true)
      }
    )

    it.each(['hello', 'mailto:a@b.c', '"http://quoted"', ''])('rejects %s', (v) => {
      expect(isURI(v)).toBe(false)
    })
  })
})
