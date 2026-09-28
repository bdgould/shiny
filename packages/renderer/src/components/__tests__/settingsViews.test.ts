import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QuerySettingsView from '../settings/QuerySettingsView.vue'
import SparqlFormattingSettingsView from '../settings/SparqlFormattingSettingsView.vue'
import PrefixManagementSettingsView from '../settings/PrefixManagementSettingsView.vue'
import { getPrefixSettings, getSparqlFormattingSettings } from '@/services/preferences/appSettings'

const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('QuerySettingsView', () => {
  const KEY = 'shiny:settings:query'

  it('loads stored settings into the form', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        connectionTimeout: 5000,
        queryTimeout: 60000,
        maxRetries: 1,
        retryDelay: 200,
      })
    )
    const w = mount(QuerySettingsView)
    await flushPromises()
    expect((w.find('#connection-timeout').element as HTMLInputElement).value).toBe('5000')
    expect((w.find('#query-timeout').element as HTMLInputElement).value).toBe('60000')
    expect((w.find('#max-retries').element as HTMLInputElement).value).toBe('1')
    expect((w.find('#retry-delay').element as HTMLInputElement).value).toBe('200')
  })

  it('saves edited values as numbers and shows a transient success message', async () => {
    const w = mount(QuerySettingsView)
    await flushPromises()
    await w.find('#connection-timeout').setValue('10000')
    await w.find('#max-retries').setValue('5')
    await w.find('.btn-primary').trigger('click')
    expect(read(KEY)).toEqual({
      connectionTimeout: 10000,
      queryTimeout: 300000,
      maxRetries: 5,
      retryDelay: 1000,
    })
    expect(w.find('.save-message').text()).toBe('Settings saved successfully!')
    expect(w.find('.save-message').classes()).toContain('success')
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })

  it('resets to defaults without saving', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        connectionTimeout: 5000,
        queryTimeout: 6000,
        maxRetries: 0,
        retryDelay: 100,
      })
    )
    const w = mount(QuerySettingsView)
    await flushPromises()
    await w.find('.btn-secondary').trigger('click')
    expect((w.find('#connection-timeout').element as HTMLInputElement).value).toBe('30000')
    expect(w.find('.save-message').text()).toContain('Reset to default values')
    expect(read(KEY).connectionTimeout).toBe(5000)
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })

  it('shows an error when saving fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = mount(QuerySettingsView)
    await flushPromises()
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await w.find('.btn-primary').trigger('click')
    setItem.mockRestore()
    expect(w.find('.save-message').text()).toBe('Failed to save settings')
    expect(w.find('.save-message').classes()).toContain('error')
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })
})

describe('SparqlFormattingSettingsView', () => {
  const KEY = 'shiny:settings:sparql-formatting'

  it('merges partially stored settings with defaults', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        indentSize: 4,
        keywordCase: 'lowercase',
        insertSpaces: { afterCommas: false },
      })
    )
    const w = mount(SparqlFormattingSettingsView)
    await flushPromises()
    expect((w.find('#indent-size').element as HTMLInputElement).value).toBe('4')
    expect((w.find('#keyword-case').element as HTMLSelectElement).value).toBe('lowercase')
    const commas = w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Space after commas'))!
      .find('input').element as HTMLInputElement
    expect(commas.checked).toBe(false)
    const beforeBraces = w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Space before opening braces'))!
      .find('input').element as HTMLInputElement
    expect(beforeBraces.checked).toBe(true)
  })

  it('saves all edited fields including nested spacing and line-break options', async () => {
    localStorage.setItem(KEY, JSON.stringify({}))
    const w = mount(SparqlFormattingSettingsView)
    await flushPromises()
    await w.find('#indent-size').setValue('3')
    await w.find('#brace-style').setValue('new-line')
    await w.find('#max-line-length').setValue('80')
    const box = (label: string) =>
      w
        .findAll('.checkbox-label')
        .find((l) => l.text().includes(label))!
        .find('input')
    await box('Use tabs instead of spaces').setValue(true)
    await box('Space before opening parentheses').setValue(true)
    await box('Blank line between clauses').setValue(true)
    await w.find('.btn-primary').trigger('click')

    const saved = read(KEY)
    expect(saved).toMatchObject({
      indentSize: 3,
      useTabs: true,
      braceStyle: 'new-line',
      maxLineLength: 80,
      insertSpaces: { beforeParentheses: true, afterCommas: true },
      lineBreaks: { betweenClauses: true, afterPrefix: true },
    })
    expect(w.find('.save-message').text()).toBe('Settings saved successfully!')
  })

  it('resets to defaults', async () => {
    localStorage.setItem(KEY, JSON.stringify({ indentSize: 8, useTabs: true }))
    const w = mount(SparqlFormattingSettingsView)
    await flushPromises()
    await w.find('.btn-secondary').trigger('click')
    expect((w.find('#indent-size').element as HTMLInputElement).value).toBe('2')
    expect(w.find('.save-message').text()).toContain('Reset to default values')
    await w.find('.btn-primary').trigger('click')
    expect(read(KEY).useTabs).toBe(false)
  })

  it('shows an error when saving fails', async () => {
    localStorage.setItem(KEY, JSON.stringify({}))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = mount(SparqlFormattingSettingsView)
    await flushPromises()
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await w.find('.btn-primary').trigger('click')
    setItem.mockRestore()
    expect(w.find('.save-message').text()).toBe('Failed to save settings')
    expect(w.find('.save-message').classes()).toContain('error')
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })
})

describe('SparqlFormattingSettingsView - fresh install', () => {
  it('does not leak unsaved nested edits into getSparqlFormattingSettings()', async () => {
    const w = mount(SparqlFormattingSettingsView)
    await flushPromises()
    const box = (label: string) =>
      w
        .findAll('.checkbox-label')
        .find((l) => l.text().includes(label))!
        .find('input')
    await box('Space after commas').setValue(false)
    await box('Blank line between clauses').setValue(true)
    await w.find('#indent-size').setValue('6')

    const fresh = getSparqlFormattingSettings()
    expect(fresh.insertSpaces.afterCommas).toBe(true)
    expect(fresh.lineBreaks.betweenClauses).toBe(false)
    expect(fresh.indentSize).toBe(2)
    expect(localStorage.getItem('shiny:settings:sparql-formatting')).toBeNull()
  })
})

describe('PrefixManagementSettingsView', () => {
  const KEY = 'shiny:settings:prefix'
  const seed = (prefixes: { prefix: string; namespace: string }[]) =>
    localStorage.setItem(KEY, JSON.stringify({ prefixes }))

  async function mountView() {
    const w = mount(PrefixManagementSettingsView)
    await flushPromises()
    return w
  }

  const rows = (w: Awaited<ReturnType<typeof mountView>>) =>
    w.findAll('.prefix-row').map((r) => r.findAll('code').map((c) => c.text()))

  it('lists stored prefixes and shows empty state when none', async () => {
    seed([{ prefix: 'ex', namespace: 'http://example.org/' }])
    const w = await mountView()
    expect(rows(w)).toEqual([['ex', 'http://example.org/']])
    await w.find('.btn-delete').trigger('click')
    expect(w.find('.empty-state').exists()).toBe(true)
  })

  it('validates and adds a prefix, replacing duplicates', async () => {
    seed([{ prefix: 'ex', namespace: 'http://example.org/' }])
    const w = await mountView()
    await w.find('.btn-add').trigger('click')
    expect(w.find('.error-text').text()).toBe('Prefix name is required')
    await w.find('#new-prefix').setValue('schema')
    await w.find('.btn-add').trigger('click')
    expect(w.find('.error-text').text()).toBe('Namespace URI is required')

    await w.find('#new-namespace').setValue('  http://schema.org/  ')
    await w.find('#new-namespace').trigger('keyup', { key: 'Enter' })
    expect(rows(w)).toEqual([
      ['ex', 'http://example.org/'],
      ['schema', 'http://schema.org/'],
    ])
    expect((w.find('#new-prefix').element as HTMLInputElement).value).toBe('')
    expect(w.find('.error-text').exists()).toBe(false)

    await w.find('#new-prefix').setValue('ex')
    await w.find('#new-namespace').setValue('http://example.com/')
    await w.find('.btn-add').trigger('click')
    expect(rows(w)[0]).toEqual(['ex', 'http://example.com/'])
    expect(rows(w)).toHaveLength(2)

    await w.find('.btn-primary').trigger('click')
    expect(read(KEY).prefixes).toEqual([
      { prefix: 'ex', namespace: 'http://example.com/' },
      { prefix: 'schema', namespace: 'http://schema.org/' },
    ])
    expect(w.find('.save-message').text()).toBe('Settings saved successfully!')
  })

  it('imports Turtle prefix definitions', async () => {
    seed([{ prefix: 'ex', namespace: 'http://old/' }])
    const w = await mountView()
    const importBtn = w.findAll('button').find((b) => b.text() === 'Import from Turtle')!

    await importBtn.trigger('click')
    expect(w.text()).toContain('Please paste Turtle prefix definitions')

    await w.find('#import-text').setValue('nothing useful here')
    await importBtn.trigger('click')
    expect(w.text()).toContain('No valid prefix definitions found')

    await w
      .find('#import-text')
      .setValue('@prefix ex: <http://new/> .\n@prefix dc: <http://purl.org/dc/elements/1.1/> .')
    await importBtn.trigger('click')
    expect(rows(w)).toEqual([
      ['ex', 'http://new/'],
      ['dc', 'http://purl.org/dc/elements/1.1/'],
    ])
    expect(w.find('.save-message').text()).toBe('Successfully imported 2 prefixes!')
    expect((w.find('#import-text').element as HTMLTextAreaElement).value).toBe('')

    await w.find('#import-text').setValue('@prefix a: <urn:a> .')
    await importBtn.trigger('click')
    expect(w.find('.save-message').text()).toBe('Successfully imported 1 prefix!')
  })

  it('loads a prefix file into the import box, handling cancel and errors', async () => {
    seed([])
    const openPrefixFile = vi.fn()
    ;(window.electronAPI.files as unknown as Record<string, unknown>).openPrefixFile =
      openPrefixFile
    const w = await mountView()
    const loadBtn = w.findAll('button').find((b) => b.text() === 'Load from File')!

    openPrefixFile.mockResolvedValueOnce({ content: '@prefix x: <urn:x> .' })
    await loadBtn.trigger('click')
    await flushPromises()
    expect((w.find('#import-text').element as HTMLTextAreaElement).value).toBe(
      '@prefix x: <urn:x> .'
    )
    expect(w.find('.save-message').text()).toContain('File loaded successfully')

    openPrefixFile.mockResolvedValueOnce({ error: 'No file selected' })
    await loadBtn.trigger('click')
    await flushPromises()
    expect(w.find('.error-text').exists()).toBe(false)

    openPrefixFile.mockResolvedValueOnce({ error: 'EACCES' })
    await loadBtn.trigger('click')
    await flushPromises()
    expect(w.find('.error-text').text()).toBe('Failed to load file: EACCES')

    openPrefixFile.mockRejectedValueOnce(new Error('ipc'))
    await loadBtn.trigger('click')
    await flushPromises()
    expect(w.find('.error-text').text()).toBe('Failed to load file. Please try again.')
  })

  it('exports prefixes as a Turtle download', async () => {
    seed([
      { prefix: 'ex', namespace: 'http://example.org/' },
      { prefix: 'a', namespace: 'urn:a:' },
    ])
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = await mountView()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Export as Turtle')!
      .trigger('click')

    expect(click).toHaveBeenCalled()
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]
    expect(await blob.text()).toBe('@prefix ex: <http://example.org/> .\n@prefix a: <urn:a:> .')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x')
    expect(w.find('.save-message').text()).toBe('Prefixes exported successfully!')
    vi.unstubAllGlobals()
  })

  it('does not leak unsaved prefix edits into getPrefixSettings() on a fresh install', async () => {
    const w = await mountView()
    expect(rows(w)).toHaveLength(7)
    await w.find('.btn-delete').trigger('click')
    await w.find('#new-prefix').setValue('ex')
    await w.find('#new-namespace').setValue('http://example.org/')
    await w.find('.btn-add').trigger('click')
    expect(rows(w).map((r) => r[0])).toEqual([
      'rdfs',
      'owl',
      'xsd',
      'skos',
      'dcterms',
      'foaf',
      'ex',
    ])

    const fresh = getPrefixSettings().prefixes.map((p) => p.prefix)
    expect(fresh).toEqual(['rdf', 'rdfs', 'owl', 'xsd', 'skos', 'dcterms', 'foaf'])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('resets to the default prefix list', async () => {
    seed([])
    const w = await mountView()
    await w
      .findAll('button')
      .find((b) => b.text() === 'Reset to Defaults')!
      .trigger('click')
    expect(rows(w).map((r) => r[0])).toEqual([
      'rdf',
      'rdfs',
      'owl',
      'xsd',
      'skos',
      'dcterms',
      'foaf',
    ])
    expect(w.find('.save-message').text()).toContain('Reset to default values')
  })

  it('shows an error when saving fails', async () => {
    seed([])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = await mountView()
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await w.find('.btn-primary').trigger('click')
    setItem.mockRestore()
    expect(w.find('.save-message').text()).toBe('Failed to save settings')
  })
})
