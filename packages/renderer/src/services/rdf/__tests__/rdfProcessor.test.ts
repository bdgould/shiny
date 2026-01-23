import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RDFProcessor } from '../rdfProcessor'
import type { DatasetCore, Quad, Term } from '@rdfjs/types'
import { Readable } from 'readable-stream'

// Create mock RDF terms
const createNamedNode = (value: string): Term => ({
  termType: 'NamedNode' as const,
  value,
  equals: vi.fn(),
})

const createLiteral = (
  value: string,
  options?: { datatype?: string; language?: string }
): Term => ({
  termType: 'Literal' as const,
  value,
  language: options?.language || '',
  datatype: options?.datatype
    ? createNamedNode(options.datatype)
    : createNamedNode('http://www.w3.org/2001/XMLSchema#string'),
  equals: vi.fn(),
})

const createBlankNode = (value: string): Term => ({
  termType: 'BlankNode' as const,
  value,
  equals: vi.fn(),
})

const createDefaultGraph = (): Term => ({
  termType: 'DefaultGraph' as const,
  value: '',
  equals: vi.fn(),
})

const createQuad = (
  subject: Term,
  predicate: Term,
  object: Term,
  graph: Term = createDefaultGraph()
): Quad =>
  ({
    subject,
    predicate,
    object,
    graph,
    equals: vi.fn(),
  }) as Quad

// Create a mock dataset
const createMockDataset = (quads: Quad[]): DatasetCore => {
  const quadSet = new Set(quads)
  return {
    size: quads.length,
    add: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    match: vi.fn(),
    [Symbol.iterator]: () => quadSet.values(),
    toStream: () => {
      const stream = new Readable({ objectMode: true })
      quads.forEach((q) => stream.push(q))
      stream.push(null)
      return stream
    },
  } as unknown as DatasetCore
}

describe('RDFProcessor', () => {
  let processor: RDFProcessor

  beforeEach(() => {
    processor = new RDFProcessor()
  })

  describe('parseTurtle', () => {
    it('should parse valid Turtle string', async () => {
      const turtle = `
        @prefix ex: <http://example.org/> .
        ex:subject ex:predicate "object" .
      `

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset).toBeDefined()
      expect(dataset.size).toBeGreaterThan(0)
    })

    it('should parse Turtle with multiple triples', async () => {
      const turtle = `
        @prefix ex: <http://example.org/> .
        ex:s1 ex:p1 "o1" .
        ex:s2 ex:p2 "o2" .
        ex:s3 ex:p3 "o3" .
      `

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset.size).toBe(3)
    })

    it('should parse Turtle with blank nodes', async () => {
      const turtle = `
        @prefix ex: <http://example.org/> .
        _:b1 ex:predicate "object" .
      `

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset.size).toBe(1)
    })

    it('should parse Turtle with typed literals', async () => {
      const turtle = `
        @prefix ex: <http://example.org/> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        ex:subject ex:count "42"^^xsd:integer .
      `

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset.size).toBe(1)
    })

    it('should parse Turtle with language-tagged literals', async () => {
      const turtle = `
        @prefix ex: <http://example.org/> .
        ex:subject ex:label "Hello"@en .
      `

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset.size).toBe(1)
    })

    it('should handle empty Turtle string', async () => {
      const turtle = ''

      const dataset = await processor.parseTurtle(turtle)

      expect(dataset.size).toBe(0)
    })
  })

  describe('serializeToTurtle', () => {
    it('should serialize dataset to Turtle format', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToTurtle(dataset)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should throw error for invalid quad without subject', async () => {
      const invalidQuad = {
        subject: null,
        predicate: createNamedNode('http://example.org/p'),
        object: createLiteral('value'),
        graph: createDefaultGraph(),
      } as unknown as Quad

      const dataset = createMockDataset([invalidQuad])

      await expect(processor.serializeToTurtle(dataset)).rejects.toThrow(
        'Invalid quad: subject missing or malformed'
      )
    })

    it('should throw error for invalid quad without predicate', async () => {
      const invalidQuad = {
        subject: createNamedNode('http://example.org/s'),
        predicate: { value: 'test' }, // Missing termType
        object: createLiteral('value'),
        graph: createDefaultGraph(),
      } as unknown as Quad

      const dataset = createMockDataset([invalidQuad])

      await expect(processor.serializeToTurtle(dataset)).rejects.toThrow(
        'Invalid quad: predicate missing or malformed'
      )
    })

    it('should throw error for invalid quad without object', async () => {
      const invalidQuad = {
        subject: createNamedNode('http://example.org/s'),
        predicate: createNamedNode('http://example.org/p'),
        object: null,
        graph: createDefaultGraph(),
      } as unknown as Quad

      const dataset = createMockDataset([invalidQuad])

      await expect(processor.serializeToTurtle(dataset)).rejects.toThrow(
        'Invalid quad: object missing or malformed'
      )
    })
  })

  describe('serializeToNTriples', () => {
    it('should serialize dataset to N-Triples format', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNTriples(dataset)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })
  })

  describe('serializeToNQuads', () => {
    it('should serialize dataset to N-Quads format', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('<http://example.org/subject>')
      expect(result).toContain('<http://example.org/predicate>')
      expect(result).toContain('"object"')
      expect(result).toContain('.')
    })

    it('should serialize quad with named graph', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object'),
          createNamedNode('http://example.org/graph')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('<http://example.org/graph>')
    })

    it('should serialize blank node subjects', async () => {
      const quads = [
        createQuad(
          createBlankNode('b1'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('_:b1')
    })

    it('should serialize literals with language tags', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/label'),
          createLiteral('Hello', { language: 'en' })
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('@en')
    })

    it('should serialize literals with datatypes', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/count'),
          createLiteral('42', { datatype: 'http://www.w3.org/2001/XMLSchema#integer' })
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('^^<http://www.w3.org/2001/XMLSchema#integer>')
    })

    it('should escape special characters in literals', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/text'),
          createLiteral('Hello "World"')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToNQuads(dataset)

      expect(result).toContain('\\"')
    })
  })

  describe('serializeToJsonLD', () => {
    it('should serialize dataset to JSON-LD format', async () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/predicate'),
          createLiteral('object')
        ),
      ]
      const dataset = createMockDataset(quads)

      const result = await processor.serializeToJsonLD(dataset)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      // Should be valid JSON
      expect(() => JSON.parse(result)).not.toThrow()
    })
  })

  describe('groupByEntity', () => {
    it('should group triples by subject', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/entity1'),
          createNamedNode('http://example.org/name'),
          createLiteral('Entity 1')
        ),
        createQuad(
          createNamedNode('http://example.org/entity1'),
          createNamedNode('http://example.org/type'),
          createNamedNode('http://example.org/Thing')
        ),
        createQuad(
          createNamedNode('http://example.org/entity2'),
          createNamedNode('http://example.org/name'),
          createLiteral('Entity 2')
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups).toHaveLength(2)

      const entity1 = groups.find((g) => g.subject === 'http://example.org/entity1')
      expect(entity1).toBeDefined()
      expect(entity1?.triples).toHaveLength(2)
      expect(entity1?.subjectType).toBe('uri')

      const entity2 = groups.find((g) => g.subject === 'http://example.org/entity2')
      expect(entity2).toBeDefined()
      expect(entity2?.triples).toHaveLength(1)
    })

    it('should identify blank node subjects', () => {
      const quads = [
        createQuad(
          createBlankNode('b1'),
          createNamedNode('http://example.org/name'),
          createLiteral('Blank Node Entity')
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups).toHaveLength(1)
      expect(groups[0].subjectType).toBe('bnode')
    })

    it('should identify URI objects', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/related'),
          createNamedNode('http://example.org/other')
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups[0].triples[0].objectType).toBe('uri')
    })

    it('should identify literal objects', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/name'),
          createLiteral('A Name')
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups[0].triples[0].objectType).toBe('literal')
    })

    it('should identify blank node objects', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/nested'),
          createBlankNode('b2')
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups[0].triples[0].objectType).toBe('bnode')
    })

    it('should include datatype for typed literals', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/count'),
          createLiteral('42', { datatype: 'http://www.w3.org/2001/XMLSchema#integer' })
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups[0].triples[0].datatype).toBe('http://www.w3.org/2001/XMLSchema#integer')
    })

    it('should include language for language-tagged literals', () => {
      const quads = [
        createQuad(
          createNamedNode('http://example.org/subject'),
          createNamedNode('http://example.org/label'),
          createLiteral('Hello', { language: 'en' })
        ),
      ]
      const dataset = createMockDataset(quads)

      const groups = processor.groupByEntity(dataset)

      expect(groups[0].triples[0].language).toBe('en')
    })

    it('should handle empty dataset', () => {
      const dataset = createMockDataset([])

      const groups = processor.groupByEntity(dataset)

      expect(groups).toHaveLength(0)
    })
  })
})
