import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HistoryPanel from '../sidebar/panels/HistoryPanel.vue'
import { useHistoryStore, type QueryHistoryEntry } from '@/stores/history'
import { useTabsStore } from '@/stores/tabs'

const NOW = new Date('2026-06-15T12:00:00Z').getTime()

function entry(overrides: Partial<QueryHistoryEntry>): QueryHistoryEntry {
  return {
    id: Math.random().toString(36).slice(2),
    query: 'SELECT * WHERE { ?s ?p ?o }',
    backendId: 'b1',
    backendName: 'DBpedia',
    executedAt: NOW,
    duration: 250,
    resultCount: 10,
    queryType: 'SELECT',
    success: true,
    error: null,
    ...overrides,
  }
}

function seed(entries: QueryHistoryEntry[]) {
  localStorage.setItem('shiny-query-history', JSON.stringify(entries))
}

let wrapper: VueWrapper

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HistoryPanel', () => {
  it('shows the empty state and no Clear All button with no history', () => {
    wrapper = mount(HistoryPanel)
    expect(wrapper.find('.empty-state').text()).toContain('No query history yet')
    expect(wrapper.find('.clear-button').exists()).toBe(false)
  })

  it('restores entries from localStorage and renders them newest first', () => {
    seed([
      entry({ id: 'old', query: 'ASK {}', queryType: 'ASK', executedAt: NOW - 3 * 3600_000 }),
      entry({ id: 'new', executedAt: NOW - 30_000 }),
    ])
    wrapper = mount(HistoryPanel)
    const items = wrapper.findAll('.history-entry')
    expect(items).toHaveLength(2)
    expect(items[0].find('.query-type').text()).toBe('SELECT')
    expect(items[0].text()).toContain('Just now')
    expect(items[1].text()).toContain('3h ago')
    expect(items[1].find('.query-type').text()).toBe('ASK')
  })

  it('formats relative times, durations and result counts', () => {
    seed([
      entry({ id: 'a', executedAt: NOW - 5 * 60_000, duration: 999 }),
      entry({ id: 'b', executedAt: NOW - 2 * 86400_000, duration: 1500 }),
      entry({ id: 'c', executedAt: NOW - 30 * 86400_000, duration: 125_000, resultCount: null }),
      entry({ id: 'd', executedAt: NOW - 40 * 86400_000, duration: null }),
    ])
    wrapper = mount(HistoryPanel)
    const items = wrapper.findAll('.history-entry')
    expect(items[0].text()).toContain('5m ago')
    expect(items[0].text()).toContain('999ms')
    expect(items[0].text()).toContain('Results:10')
    expect(items[1].text()).toContain('2d ago')
    expect(items[1].text()).toContain('1.50s')
    expect(items[2].text()).toContain('2m 5s')
    expect(items[2].text()).not.toContain('Results:')
    expect(items[2].text()).not.toContain('ago')
    expect(items[3].text()).not.toContain('Duration:')
  })

  it('renders failed entries with the error and FAILED label', () => {
    const longError = 'E'.repeat(100)
    seed([entry({ success: false, queryType: null, error: longError, resultCount: null })])
    wrapper = mount(HistoryPanel)
    const item = wrapper.find('.history-entry')
    expect(item.classes()).toContain('error')
    expect(item.find('.status-icon').text()).toBe('✗')
    expect(item.find('.query-type').text()).toBe('FAILED')
    expect(item.find('.error-text').text()).toBe('E'.repeat(80) + '...')
  })

  it('collapses whitespace and truncates long queries', () => {
    const q = 'SELECT   *\n\nWHERE { ' + 'x'.repeat(200) + ' }'
    seed([entry({ query: q })])
    wrapper = mount(HistoryPanel)
    const text = wrapper.find('.entry-query code').text()
    expect(text.startsWith('SELECT * WHERE {')).toBe(true)
    expect(text.endsWith('...')).toBe(true)
    expect(text.length).toBe(103)
  })

  it('opens the query in a new tab on click', async () => {
    seed([entry({ query: 'ASK { ?s ?p ?o }', backendId: 'b9' })])
    wrapper = mount(HistoryPanel)
    const tabs = useTabsStore()
    await wrapper.find('.history-entry').trigger('click')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.activeTab?.query).toBe('ASK { ?s ?p ?o }')
    expect(tabs.activeTab?.backendId).toBe('b9')
  })

  it('deletes a single entry without opening a tab', async () => {
    seed([entry({ id: 'x' }), entry({ id: 'y', executedAt: NOW - 1000 })])
    wrapper = mount(HistoryPanel)
    await wrapper.findAll('.delete-button')[0].trigger('click')
    expect(useHistoryStore().entries.map((e) => e.id)).toEqual(['y'])
    expect(useTabsStore().tabs).toHaveLength(0)
  })

  it('clears all history only after confirmation', async () => {
    seed([entry({})])
    const confirmMock = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmMock)
    wrapper = mount(HistoryPanel)
    await wrapper.find('.clear-button').trigger('click')
    expect(wrapper.findAll('.history-entry')).toHaveLength(1)

    confirmMock.mockReturnValue(true)
    await wrapper.find('.clear-button').trigger('click')
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
