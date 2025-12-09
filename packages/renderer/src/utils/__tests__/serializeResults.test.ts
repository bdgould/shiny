import { describe, it, expect } from 'vitest'
import {
  serializeToCSV,
  serializeToJSON,
  serializeAskToJSON,
  getAvailableFormats,
  serializeResults,
} from '../serializeResults'

describe('serializeToCSV', () => {
  it('should serialize SELECT results to CSV format', () => {
    const results = {
      data: {
        head: { vars: ['name', 'age'] },
        results: {
          bindings: [
            { name: { value: 'Alice' }, age: { value: '30' } },
            { name: { value: 'Bob' }, age: { value: '25' } },
          ],
        },
      },
    }

    const csv = serializeToCSV(results)

    expect(csv).toBe('name,age\nAlice,30\nBob,25')
  })

  it('should handle missing values in CSV', () => {
    const results = {
      data: {
        head: { vars: ['name', 'age'] },
        results: {
          bindings: [
            { name: { value: 'Alice' }, age: { value: '30' } },
            { name: { value: 'Bob' } }, // Missing age
          ],
        },
      },
    }

    const csv = serializeToCSV(results)

    expect(csv).toBe('name,age\nAlice,30\nBob,')
  })

  it('should escape quotes and commas in CSV', () => {
    const results = {
      data: {
        head: { vars: ['name', 'description'] },
        results: {
          bindings: [
            {
              name: { value: 'Test' },
              description: { value: 'Contains "quotes" and, comma' },
            },
          ],
        },
      },
    }

    const csv = serializeToCSV(results)

    expect(csv).toContain('"Contains ""quotes"" and, comma"')
  })

  it('should throw error for invalid SELECT results', () => {
    const invalidResults = { data: { foo: 'bar' } }

    expect(() => serializeToCSV(invalidResults)).toThrow('Invalid SELECT query results format')
  })

  it('should handle results without data wrapper', () => {
    const results = {
      head: { vars: ['name'] },
      results: {
        bindings: [{ name: { value: 'Alice' } }],
      },
    }

    const csv = serializeToCSV(results)

    expect(csv).toBe('name\nAlice')
  })
})

describe('serializeToJSON', () => {
  it('should serialize SELECT results to JSON', () => {
    const results = {
      data: {
        head: { vars: ['name'] },
        results: { bindings: [] },
      },
    }

    const json = serializeToJSON(results)
    const parsed = JSON.parse(json)

    expect(parsed).toEqual(results.data)
  })

  it('should handle results without data wrapper', () => {
    const results = {
      head: { vars: ['name'] },
      results: { bindings: [] },
    }

    const json = serializeToJSON(results)
    const parsed = JSON.parse(json)

    expect(parsed).toEqual(results)
  })
})

describe('serializeAskToJSON', () => {
  it('should serialize ASK results to JSON', () => {
    const results = {
      data: { boolean: true },
    }

    const json = serializeAskToJSON(results)
    const parsed = JSON.parse(json)

    expect(parsed).toEqual({ boolean: true })
  })
})

describe('getAvailableFormats', () => {
  it('should return CSV and JSON for SELECT queries', () => {
    const formats = getAvailableFormats('SELECT')

    expect(formats).toEqual([
      { value: 'csv', label: 'CSV' },
      { value: 'json', label: 'JSON' },
    ])
  })

  it('should return RDF formats for CONSTRUCT queries', () => {
    const formats = getAvailableFormats('CONSTRUCT')

    expect(formats).toHaveLength(5)
    expect(formats[0]).toEqual({ value: 'turtle', label: 'Turtle' })
    expect(formats).toContainEqual({ value: 'jsonld', label: 'JSON-LD' })
  })

  it('should return RDF formats for DESCRIBE queries', () => {
    const formats = getAvailableFormats('DESCRIBE')

    expect(formats).toHaveLength(5)
  })

  it('should return only JSON for ASK queries', () => {
    const formats = getAvailableFormats('ASK')

    expect(formats).toEqual([{ value: 'json', label: 'JSON' }])
  })

  it('should return empty array for null query type', () => {
    const formats = getAvailableFormats(null)

    expect(formats).toEqual([])
  })
})

describe('serializeResults', () => {
  it('should serialize SELECT results to CSV', async () => {
    const results = {
      data: {
        head: { vars: ['name'] },
        results: {
          bindings: [{ name: { value: 'Alice' } }],
        },
      },
    }

    const serialized = await serializeResults(results, 'SELECT', 'csv')

    expect(serialized).toBe('name\nAlice')
  })

  it('should serialize SELECT results to JSON', async () => {
    const results = {
      data: {
        head: { vars: ['name'] },
        results: { bindings: [] },
      },
    }

    const serialized = await serializeResults(results, 'SELECT', 'json')
    const parsed = JSON.parse(serialized)

    expect(parsed).toEqual(results.data)
  })

  it('should throw error for unsupported SELECT format', async () => {
    const results = { data: {} }

    await expect(serializeResults(results, 'SELECT', 'xml')).rejects.toThrow(
      'Unsupported format "xml" for SELECT query'
    )
  })

  it('should serialize ASK results to JSON', async () => {
    const results = { data: { boolean: false } }

    const serialized = await serializeResults(results, 'ASK', 'json')
    const parsed = JSON.parse(serialized)

    expect(parsed).toEqual({ boolean: false })
  })

  it('should return Turtle data as-is for CONSTRUCT queries', async () => {
    const turtleData = '@prefix ex: <http://example.org/> .\nex:subject ex:predicate ex:object .'
    const results = { data: turtleData }

    const serialized = await serializeResults(results, 'CONSTRUCT', 'turtle')

    expect(serialized).toBe(turtleData)
  })

  it('should handle CONSTRUCT results without data wrapper', async () => {
    const turtleData = '@prefix ex: <http://example.org/> .\nex:subject ex:predicate ex:object .'

    const serialized = await serializeResults(turtleData, 'CONSTRUCT', 'turtle')

    expect(serialized).toBe(turtleData)
  })

  it('should throw error for no results', async () => {
    await expect(serializeResults(null, 'SELECT', 'csv')).rejects.toThrow('No results to serialize')
  })

  it('should throw error for unsupported query type', async () => {
    const results = { data: {} }

    await expect(serializeResults(results, 'INVALID' as any, 'csv')).rejects.toThrow(
      'Unsupported query type: INVALID'
    )
  })
})
