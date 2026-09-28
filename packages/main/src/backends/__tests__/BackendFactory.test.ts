import { describe, it, expect } from 'vitest'
import { BackendFactory } from '../BackendFactory'
import { Sparql11Provider } from '../providers/Sparql11Provider'
import { GraphStudioProvider } from '../providers/GraphStudioProvider'
import { MobiProvider } from '../providers/MobiProvider'
import { NeptuneProvider } from '../providers/NeptuneProvider'
import { StardogProvider } from '../providers/StardogProvider'
import { GraphDBProvider } from '../providers/GraphDBProvider'
import type { BackendType } from '../types'

describe('BackendFactory', () => {
  const expected: Array<[BackendType, new () => unknown]> = [
    ['sparql-1.1', Sparql11Provider],
    ['graphstudio', GraphStudioProvider],
    ['mobi', MobiProvider],
    ['neptune', NeptuneProvider],
    ['stardog', StardogProvider],
    ['graphdb', GraphDBProvider],
  ]

  it.each(expected)('returns a %s provider of the right class and type', (type, cls) => {
    const provider = BackendFactory.getProvider(type)
    expect(provider).toBeInstanceOf(cls)
    expect(provider.type).toBe(type)
  })

  it('returns the same provider instance on repeated lookups', () => {
    expect(BackendFactory.getProvider('graphdb')).toBe(BackendFactory.getProvider('graphdb'))
  })

  it('throws for an unknown backend type', () => {
    expect(() => BackendFactory.getProvider('virtuoso' as BackendType)).toThrow(
      'Unknown backend type: virtuoso'
    )
  })

  it('lists all registered types', () => {
    expect(BackendFactory.getAvailableTypes().sort()).toEqual(
      ['graphdb', 'graphstudio', 'mobi', 'neptune', 'sparql-1.1', 'stardog'].sort()
    )
  })

  it('reports whether a type is supported', () => {
    expect(BackendFactory.isSupported('sparql-1.1')).toBe(true)
    expect(BackendFactory.isSupported('mobi')).toBe(true)
    expect(BackendFactory.isSupported('virtuoso')).toBe(false)
    expect(BackendFactory.isSupported('')).toBe(false)
  })
})
