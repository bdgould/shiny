import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import https from 'https'
import { BaseProvider } from '../BaseProvider'
import type { BackendConfig, BackendCredentials, QueryResult, ValidationResult } from '../../types'

/** Concrete subclass exposing the protected helpers for testing. */
class TestProvider extends BaseProvider {
  readonly type = 'sparql-1.1' as const

  async execute(): Promise<QueryResult> {
    return { data: null, queryType: 'SELECT', contentType: 'unknown' }
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true }
  }

  authHeaders(config: BackendConfig, credentials?: BackendCredentials) {
    return this.getAuthHeaders(config, credentials)
  }

  contentType(headers: Record<string, unknown>) {
    return this.getContentType(headers)
  }

  isValidUrl(url: string) {
    return this.validateUrl(url)
  }

  agent(config: BackendConfig) {
    return this.createHttpsAgent(config)
  }

  endpointUrl(config: BackendConfig) {
    return this.buildEndpointUrl(config)
  }
}

function makeConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    id: 'b1',
    name: 'Test',
    type: 'sparql-1.1',
    endpoint: 'https://example.org/sparql',
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider

  beforeEach(() => {
    provider = new TestProvider()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAuthHeaders', () => {
    it('returns no headers when credentials are missing', () => {
      expect(provider.authHeaders(makeConfig({ authType: 'basic' }))).toEqual({})
    })

    it('returns no headers for authType none even with credentials', () => {
      expect(
        provider.authHeaders(makeConfig({ authType: 'none' }), {
          backendId: 'b1',
          username: 'u',
          password: 'p',
          token: 't',
        })
      ).toEqual({})
    })

    it('builds a Basic header from username and password', () => {
      const headers = provider.authHeaders(makeConfig({ authType: 'basic' }), {
        backendId: 'b1',
        username: 'alice',
        password: 's3cr:et',
      })
      expect(headers).toEqual({
        Authorization: `Basic ${Buffer.from('alice:s3cr:et').toString('base64')}`,
      })
    })

    it('omits Basic header when password is missing', () => {
      expect(
        provider.authHeaders(makeConfig({ authType: 'basic' }), {
          backendId: 'b1',
          username: 'alice',
        })
      ).toEqual({})
    })

    it('builds a Bearer header from the token', () => {
      expect(
        provider.authHeaders(makeConfig({ authType: 'bearer' }), {
          backendId: 'b1',
          token: 'abc.def',
        })
      ).toEqual({ Authorization: 'Bearer abc.def' })
    })

    it('omits Bearer header when token is missing', () => {
      expect(provider.authHeaders(makeConfig({ authType: 'bearer' }), { backendId: 'b1' })).toEqual(
        {}
      )
    })

    it('passes custom headers through', () => {
      expect(
        provider.authHeaders(makeConfig({ authType: 'custom' }), {
          backendId: 'b1',
          headers: { 'X-Api-Key': 'k', 'X-Tenant': 't' },
        })
      ).toEqual({ 'X-Api-Key': 'k', 'X-Tenant': 't' })
    })

    it('returns no headers for custom auth without headers', () => {
      expect(provider.authHeaders(makeConfig({ authType: 'custom' }), { backendId: 'b1' })).toEqual(
        {}
      )
    })
  })

  describe('getContentType', () => {
    it('returns the content-type string', () => {
      expect(provider.contentType({ 'content-type': 'text/turtle' })).toBe('text/turtle')
    })

    it.each([
      [{}],
      [{ 'content-type': '' }],
      [{ 'content-type': ['a', 'b'] }],
      [{ 'content-type': 5 }],
    ])('falls back to unknown for %j', (headers) => {
      expect(provider.contentType(headers)).toBe('unknown')
    })
  })

  describe('validateUrl', () => {
    it.each(['http://localhost:7200', 'https://example.org/sparql?x=1'])('accepts %s', (url) => {
      expect(provider.isValidUrl(url)).toBe(true)
    })

    it.each(['ftp://example.org', 'file:///etc/passwd', 'not a url', '', 'javascript:alert(1)'])(
      'rejects %s',
      (url) => {
        expect(provider.isValidUrl(url)).toBe(false)
      }
    )
  })

  describe('createHttpsAgent', () => {
    it('returns undefined for http endpoints', () => {
      expect(provider.agent(makeConfig({ endpoint: 'http://example.org' }))).toBeUndefined()
    })

    it('creates a verifying agent for https endpoints by default', () => {
      const agent = provider.agent(makeConfig())
      expect(agent).toBeInstanceOf(https.Agent)
      expect(agent?.options.rejectUnauthorized).toBe(true)
    })

    it('disables certificate verification when allowInsecure is set', () => {
      const agent = provider.agent(makeConfig({ allowInsecure: true }))
      expect(agent?.options.rejectUnauthorized).toBe(false)
    })
  })

  describe('buildEndpointUrl', () => {
    it('returns the configured endpoint unchanged', () => {
      expect(provider.endpointUrl(makeConfig({ endpoint: 'http://x/y/' }))).toBe('http://x/y/')
    })
  })
})
