import { describe, it, expect } from 'vitest'
import { aiTools, requiresApproval, toolsRequiringApproval } from '../aiTools'
import { executeTool } from '../toolExecutor'

describe('aiTools', () => {
  it('defines uniquely named function tools', () => {
    const names = aiTools.map((t) => t.function.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([
      'searchOntology',
      'listOntologyElements',
      'getClassDetails',
      'getPropertyDetails',
      'runSparqlQuery',
      'refreshOntologyCache',
      'getQueryContext',
    ])
    for (const tool of aiTools) {
      expect(tool.type).toBe('function')
      expect(tool.function.description.length).toBeGreaterThan(0)
      expect(tool.function.parameters.type).toBe('object')
    }
  })

  it('only lists required parameters that are declared', () => {
    for (const tool of aiTools) {
      const declared = Object.keys(tool.function.parameters.properties)
      for (const req of tool.function.parameters.required ?? []) {
        expect(declared).toContain(req)
      }
      for (const [, prop] of Object.entries(tool.function.parameters.properties)) {
        expect(typeof prop.type).toBe('string')
        expect(prop.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('every declared tool is handled by the executor', async () => {
    for (const tool of aiTools) {
      const r = await executeTool(
        { id: 'x', name: tool.function.name, arguments: {}, status: 'approved' },
        { backendId: null }
      )
      expect(r.error ?? '').not.toMatch(/Unknown tool/)
    }
  })

  it('requires approval only for query execution', () => {
    expect(requiresApproval('runSparqlQuery')).toBe(true)
    expect(requiresApproval('searchOntology')).toBe(false)
    expect(requiresApproval('nonexistent')).toBe(false)
    expect([...toolsRequiringApproval]).toEqual(['runSparqlQuery'])
  })
})
