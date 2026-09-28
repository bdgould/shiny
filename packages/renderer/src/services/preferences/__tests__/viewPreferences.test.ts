import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const KEY = 'shiny:query:view-preferences'

// Fresh module per test so module-level defaults cannot leak between tests.
async function load() {
  vi.resetModules()
  return import('../viewPreferences')
}

describe('viewPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns defaults when nothing is stored', async () => {
    const { getViewPreferences } = await load()
    expect(getViewPreferences()).toEqual({
      select: 'table',
      construct: 'entity-table',
      ask: 'badge',
    })
  })

  it('merges stored values over defaults', async () => {
    const { getViewPreferences } = await load()
    localStorage.setItem(KEY, JSON.stringify({ select: 'json' }))
    expect(getViewPreferences()).toEqual({
      select: 'json',
      construct: 'entity-table',
      ask: 'badge',
    })
  })

  it('falls back to defaults on corrupt JSON', async () => {
    const { getViewPreferences } = await load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(KEY, '{not json')
    expect(getViewPreferences().select).toBe('table')
    expect(err).toHaveBeenCalledWith('Failed to load view preferences:', expect.any(Error))
  })

  it('persists a single preference without clobbering others', async () => {
    const { getViewPreference, setViewPreference } = await load()
    setViewPreference('construct', 'turtle')
    setViewPreference('ask', 'json')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      select: 'table',
      construct: 'turtle',
      ask: 'json',
    })
    expect(getViewPreference('construct')).toBe('turtle')
    expect(getViewPreference('select')).toBe('table')
  })

  it('updates an existing stored preference', async () => {
    const { getViewPreference, setViewPreference } = await load()
    localStorage.setItem(KEY, JSON.stringify({ select: 'json', construct: 'nquads' }))
    setViewPreference('select', 'table')
    expect(getViewPreference('select')).toBe('table')
    expect(getViewPreference('construct')).toBe('nquads')
  })

  it('does not mutate the defaults when setting a preference with empty storage', async () => {
    const { getViewPreference, setViewPreference } = await load()
    const original = getViewPreference('select')
    const other = original === 'table' ? 'json' : 'table'
    setViewPreference('select', other)
    localStorage.clear()
    expect(getViewPreference('select')).toBe(original)
  })

  it('logs and swallows storage write failures', async () => {
    const { setViewPreference } = await load()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(() => setViewPreference('select', 'json')).not.toThrow()
    expect(err).toHaveBeenCalledWith('Failed to save view preference:', expect.any(Error))
  })
})
