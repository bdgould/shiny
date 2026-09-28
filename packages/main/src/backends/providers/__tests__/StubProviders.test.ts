import { describe, it, expect } from 'vitest'
import { NeptuneProvider } from '../NeptuneProvider'
import { StardogProvider } from '../StardogProvider'
import type { BackendConfig } from '../../types'

const config: BackendConfig = {
  id: 'b1',
  name: 'Stub',
  type: 'neptune',
  endpoint: 'https://example.org/sparql',
  authType: 'none',
  createdAt: 0,
  updatedAt: 0,
}

describe.each([
  ['NeptuneProvider', new NeptuneProvider(), 'neptune', 'AWS Neptune provider not yet implemented'],
  ['StardogProvider', new StardogProvider(), 'stardog', 'Stardog provider not yet implemented'],
] as const)('%s (stub)', (_name, provider, type, message) => {
  it('exposes its backend type', () => {
    expect(provider.type).toBe(type)
  })

  it('rejects query execution as not implemented', async () => {
    await expect(provider.execute(config, 'SELECT * WHERE { ?s ?p ?o }')).rejects.toThrow(message)
  })

  it('reports validation as not implemented', async () => {
    await expect(provider.validate(config)).resolves.toEqual({ valid: false, error: message })
  })
})
