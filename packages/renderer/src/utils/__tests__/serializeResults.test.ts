import { describe, it, expect } from 'vitest'
import {
  serializeToCSV,
  serializeToTSV,
  serializeToSparqlXML,
  serializeAskToSparqlXML,
  serializeToMarkdown,
  serializeToJSON,
  serializeAskToJSON,
  getAvailableFormats,
  serializeResults,
  tsvTerm,
  FORMAT_EXTENSIONS,
  FORMAT_LABELS,
} from '../serializeResults'

const typedResults = {
  data: {
    head: { vars: ['s', 'label', 'age', 'b'] },
    results: {
      bindings: [
        {
          s: { type: 'uri', value: 'http://ex.org/a' },
          label: { type: 'literal', value: 'A "quoted"\ttab', 'xml:lang': 'en' },
          age: {
            type: 'literal',
            value: '42',
            datatype: 'http://www.w3.org/2001/XMLSchema#integer',
          },
          b: { type: 'bnode', value: 'b0' },
        },
        { s: { type: 'uri', value: 'http://ex.org/<odd>&' } },
      ],
    },
  },
}

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

describe('serializeToTSV', () => {
  it('encodes terms per the SPARQL 1.1 TSV spec', () => {
    expect(tsvTerm({ type: 'uri', value: 'http://ex.org/a' })).toBe('<http://ex.org/a>')
    expect(tsvTerm({ type: 'bnode', value: 'b0' })).toBe('_:b0')
    expect(tsvTerm({ type: 'literal', value: 'plain' })).toBe('"plain"')
    expect(tsvTerm({ type: 'literal', value: 'hi', 'xml:lang': 'en' })).toBe('"hi"@en')
    expect(
      tsvTerm({ type: 'literal', value: '1', datatype: 'http://www.w3.org/2001/XMLSchema#int' })
    ).toBe('"1"^^<http://www.w3.org/2001/XMLSchema#int>')
    expect(tsvTerm({ type: 'literal', value: 'a\tb\nc\\d"e' })).toBe('"a\\tb\\nc\\\\d\\"e"')
    expect(tsvTerm(undefined)).toBe('')
  })

  it('writes a ?var header and one tab-separated row per binding', () => {
    const tsv = serializeToTSV(typedResults)
    expect(tsv.split('\n')).toEqual([
      '?s\t?label\t?age\t?b',
      '<http://ex.org/a>\t"A \\"quoted\\"\\ttab"@en\t"42"^^<http://www.w3.org/2001/XMLSchema#integer>\t_:b0',
      '<http://ex.org/<odd>&>\t\t\t',
    ])
  })

  it('returns an empty string with no variables and rejects bad input', () => {
    expect(serializeToTSV({ head: { vars: [] }, results: { bindings: [] } })).toBe('')
    expect(() => serializeToTSV({ data: {} })).toThrow('Invalid SELECT query results format')
  })
})

describe('serializeToSparqlXML', () => {
  it('writes the W3C results XML with escaped terms', () => {
    const xml = serializeToSparqlXML(typedResults)
    expect(xml).toContain('<sparql xmlns="http://www.w3.org/2005/sparql-results#">')
    expect(xml).toContain('<variable name="label"/>')
    expect(xml).toContain('<binding name="s"><uri>http://ex.org/a</uri></binding>')
    expect(xml).toContain(
      '<binding name="label"><literal xml:lang="en">A &quot;quoted&quot;\ttab</literal></binding>'
    )
    expect(xml).toContain(
      '<literal datatype="http://www.w3.org/2001/XMLSchema#integer">42</literal>'
    )
    expect(xml).toContain('<bnode>b0</bnode>')
    expect(xml).toContain('<uri>http://ex.org/&lt;odd&gt;&amp;</uri>')
    expect(xml.split('<result>')).toHaveLength(3)
    expect(xml.trim().endsWith('</sparql>')).toBe(true)
  })

  it('serializes ASK results as a boolean', () => {
    expect(serializeAskToSparqlXML({ data: { head: {}, boolean: true } })).toContain(
      '<boolean>true</boolean>'
    )
    expect(serializeAskToSparqlXML({ boolean: false })).toContain('<boolean>false</boolean>')
    expect(serializeAskToSparqlXML({})).toContain('<boolean>false</boolean>')
  })
})

describe('serializeToMarkdown', () => {
  it('writes a GFM table with escaped pipes and flattened newlines', () => {
    const md = serializeToMarkdown({
      head: { vars: ['a', 'b'] },
      results: {
        bindings: [{ a: { value: 'x|y' }, b: { value: 'line1\nline2' } }, { a: { value: 'only' } }],
      },
    })
    expect(md.split('\n')).toEqual([
      '| a | b |',
      '| --- | --- |',
      '| x\\|y | line1 line2 |',
      '| only |  |',
    ])
  })

  it('returns an empty string with no variables', () => {
    expect(serializeToMarkdown({ head: { vars: [] }, results: { bindings: [] } })).toBe('')
  })
})

describe('format tables', () => {
  it('has an extension and label for every offered format', () => {
    for (const qt of ['SELECT', 'ASK', 'CONSTRUCT'] as const) {
      for (const f of getAvailableFormats(qt)) {
        expect(FORMAT_EXTENSIONS[f.value]).toBeTruthy()
        expect(FORMAT_LABELS[f.value]).toBe(f.label)
      }
    }
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
  it('should return tabular formats for SELECT queries', () => {
    const formats = getAvailableFormats('SELECT')

    expect(formats).toEqual([
      { value: 'csv', label: 'CSV' },
      { value: 'tsv', label: 'TSV' },
      { value: 'json', label: 'JSON' },
      { value: 'xml', label: 'SPARQL XML' },
      { value: 'markdown', label: 'Markdown table' },
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

  it('should return JSON and XML for ASK queries', () => {
    const formats = getAvailableFormats('ASK')

    expect(formats).toEqual([
      { value: 'json', label: 'JSON' },
      { value: 'xml', label: 'SPARQL XML' },
    ])
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

    await expect(serializeResults(results, 'SELECT', 'yaml')).rejects.toThrow(
      'Unsupported format "yaml" for SELECT query'
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
