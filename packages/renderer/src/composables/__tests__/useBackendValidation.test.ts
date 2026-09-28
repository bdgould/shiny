import { describe, it, expect } from 'vitest'
import { useBackendValidation, type BackendFormData } from '../useBackendValidation'

function form(overrides: Partial<BackendFormData> = {}): BackendFormData {
  return {
    name: 'My Backend',
    type: 'sparql-1.1',
    endpoint: 'https://example.org/sparql',
    authType: 'none',
    ...overrides,
  }
}

describe('useBackendValidation', () => {
  describe('validateName', () => {
    it('requires a non-blank name', () => {
      const { validateName } = useBackendValidation()
      expect(validateName('')).toBe('Name is required')
      expect(validateName('   ')).toBe('Name is required')
    })

    it('limits names to 50 characters', () => {
      const { validateName } = useBackendValidation()
      expect(validateName('a'.repeat(50))).toBeUndefined()
      expect(validateName('a'.repeat(51))).toBe('Name must be 50 characters or less')
    })
  })

  describe('validateEndpoint', () => {
    it('requires an endpoint', () => {
      const { validateEndpoint } = useBackendValidation()
      expect(validateEndpoint('')).toBe('Endpoint URL is required')
      expect(validateEndpoint('  ')).toBe('Endpoint URL is required')
    })

    it('rejects malformed URLs', () => {
      const { validateEndpoint } = useBackendValidation()
      expect(validateEndpoint('not a url')).toBe('Invalid URL format')
    })

    it('rejects non-HTTP protocols', () => {
      const { validateEndpoint } = useBackendValidation()
      expect(validateEndpoint('ftp://example.org/sparql')).toBe(
        'Endpoint must use HTTP or HTTPS protocol'
      )
    })

    it('accepts http and https', () => {
      const { validateEndpoint } = useBackendValidation()
      expect(validateEndpoint('http://localhost:3030/ds')).toBeUndefined()
      expect(validateEndpoint('https://example.org/sparql')).toBeUndefined()
    })
  })

  describe('validateForm', () => {
    it('passes a valid minimal form', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form())).toBe(true)
      expect(v.errors.value).toEqual({})
      expect(v.hasErrors.value).toBe(false)
    })

    it('collects name and endpoint errors', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ name: '', endpoint: 'bad' }))).toBe(false)
      expect(v.errors.value).toEqual({ name: 'Name is required', endpoint: 'Invalid URL format' })
      expect(v.hasErrors.value).toBe(true)
    })

    it('requires username and password for basic auth', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ authType: 'basic' }))).toBe(false)
      expect(v.errors.value).toEqual({
        username: 'Username is required for Basic Auth',
        password: 'Password is required for Basic Auth',
      })
      expect(v.validateForm(form({ authType: 'basic', username: 'u', password: 'p' }))).toBe(true)
    })

    it('requires a token for bearer auth', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ authType: 'bearer', token: ' ' }))).toBe(false)
      expect(v.errors.value.token).toBe('Token is required for Bearer authentication')
      expect(v.validateForm(form({ authType: 'bearer', token: 'abc' }))).toBe(true)
    })

    it('validates custom headers', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ authType: 'custom' }))).toBe(false)
      expect(v.errors.value.customHeaders).toBe(
        'At least one header is required for Custom Headers authentication'
      )

      v.validateForm(form({ authType: 'custom', customHeaders: [{ key: ' ', value: 'v' }] }))
      expect(v.errors.value.customHeaders).toBe('Header key cannot be empty')

      v.validateForm(form({ authType: 'custom', customHeaders: [{ key: 'X-Key', value: '' }] }))
      expect(v.errors.value.customHeaders).toBe('Header value cannot be empty')

      expect(
        v.validateForm(form({ authType: 'custom', customHeaders: [{ key: 'X-Key', value: 'v' }] }))
      ).toBe(true)
    })

    it('requires a graphmart for GraphStudio backends', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ type: 'graphstudio' }))).toBe(false)
      expect(v.errors.value.graphmart).toBe('Please select a graphmart')
      expect(v.validateForm(form({ type: 'graphstudio', graphmartUri: 'urn:gm' }))).toBe(true)
    })

    it('requires catalog and record for Mobi in record mode (default)', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ type: 'mobi' }))).toBe(false)
      expect(v.errors.value).toEqual({
        catalog: 'Please select a catalog',
        record: 'Please select a record',
      })
      expect(v.validateForm(form({ type: 'mobi', catalogId: 'c', recordId: 'r' }))).toBe(true)
    })

    it('requires a repository for Mobi in repository mode', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ type: 'mobi', queryMode: 'repository' }))).toBe(false)
      expect(v.errors.value).toEqual({ repository: 'Please select a repository' })
      expect(
        v.validateForm(form({ type: 'mobi', queryMode: 'repository', repositoryId: 'repo' }))
      ).toBe(true)
    })

    it('requires a repository for GraphDB backends', () => {
      const v = useBackendValidation()
      expect(v.validateForm(form({ type: 'graphdb' }))).toBe(false)
      expect(v.errors.value.graphdbRepository).toBe('Please select a repository')
      expect(v.validateForm(form({ type: 'graphdb', graphdbRepositoryId: 'r1' }))).toBe(true)
    })

    it('resets errors on each validation and via clearErrors', () => {
      const v = useBackendValidation()
      v.validateForm(form({ name: '' }))
      expect(v.hasErrors.value).toBe(true)
      v.clearErrors()
      expect(v.errors.value).toEqual({})
      expect(v.hasErrors.value).toBe(false)

      v.validateForm(form({ name: '' }))
      v.validateForm(form())
      expect(v.errors.value).toEqual({})
    })
  })
})
