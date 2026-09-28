import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import AISettingsView from '../settings/AISettingsView.vue'
import { testAIConnection, fetchAIModels } from '@/services/preferences/appSettings'

vi.mock('@/services/preferences/appSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/preferences/appSettings')>()
  return { ...actual, testAIConnection: vi.fn(), fetchAIModels: vi.fn() }
})

const testMock = vi.mocked(testAIConnection)
const fetchMock = vi.mocked(fetchAIModels)
const AI_KEY = 'shiny:settings:ai'
const CTX_KEY = 'shiny:settings:query-context'
const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')

function seedAI(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    AI_KEY,
    JSON.stringify({
      endpoint: 'https://ai.example/v1',
      model: 'gpt-4',
      apiKey: 'sk-test',
      temperature: 0.2,
      maxTokens: 500,
      ...overrides,
    })
  )
}

async function mountView() {
  const w = mount(AISettingsView)
  await flushPromises()
  return w
}

const val = (w: VueWrapper, sel: string) => (w.find(sel).element as HTMLInputElement).value

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  testMock.mockReset()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AISettingsView', () => {
  it('loads defaults when nothing is stored and disables actions without an API key', async () => {
    const w = await mountView()
    expect(val(w, '#ai-endpoint')).toBe('https://api.openai.com/v1')
    expect(val(w, '#ai-model')).toBe('gpt-3.5-turbo')
    expect(w.find('.btn-test').attributes('disabled')).toBeDefined()
    expect(w.find('.btn-fetch-models').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Click "Fetch Models" to load available models')
  })

  it('loads stored settings and toggles API key visibility', async () => {
    seedAI()
    const w = await mountView()
    expect(val(w, '#ai-endpoint')).toBe('https://ai.example/v1')
    expect(val(w, '#ai-api-key')).toBe('sk-test')
    expect(val(w, '#ai-temperature')).toBe('0.2')
    expect(w.find('#ai-api-key').attributes('type')).toBe('password')
    await w.find('.btn-toggle-visibility').trigger('click')
    expect(w.find('#ai-api-key').attributes('type')).toBe('text')
    await w.find('.btn-toggle-visibility').trigger('click')
    expect(w.find('#ai-api-key').attributes('type')).toBe('password')
  })

  it('saves AI and query context settings', async () => {
    const w = await mountView()
    await w.find('#ai-endpoint').setValue('https://local/v1')
    await w.find('#ai-api-key').setValue('sk-new')
    await w.find('#ai-model').setValue('llama')
    await w.find('#ai-max-tokens').setValue('2000')
    expect(w.find('#query-context-content').exists()).toBe(false)
    await w.find('.checkbox-label input').setValue(true)
    await w.find('#query-context-content').setValue('# Conventions')
    await w.find('.btn-primary').trigger('click')

    expect(read(AI_KEY)).toMatchObject({
      endpoint: 'https://local/v1',
      apiKey: 'sk-new',
      model: 'llama',
      maxTokens: 2000,
    })
    expect(read(CTX_KEY)).toEqual({ enabled: true, content: '# Conventions' })
    expect(w.find('.save-message').text()).toBe('Settings saved successfully!')
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })

  it('shows an error when saving fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = await mountView()
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

  it('fetches models into a select and warns if the current model is missing', async () => {
    seedAI({ model: 'gpt-4' })
    fetchMock.mockResolvedValue({ success: true, models: ['gpt-4o', 'gpt-4o-mini'] })
    const w = await mountView()
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('https://ai.example/v1', 'sk-test')
    expect(w.find('select#ai-model').exists()).toBe(true)
    expect(w.findAll('select#ai-model option').map((o) => o.text())).toEqual([
      'Select a model...',
      'gpt-4o',
      'gpt-4o-mini',
    ])
    expect(w.find('.warning').text()).toContain('Model "gpt-4" not found')

    // Switch to custom model entry
    await w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Use custom model name'))!
      .find('input')
      .setValue(true)
    expect(w.find('input#ai-model').exists()).toBe(true)
  })

  it('shows no warning when the current model is in the list', async () => {
    seedAI({ model: 'gpt-4o' })
    fetchMock.mockResolvedValue({ success: true, models: ['gpt-4o'] })
    const w = await mountView()
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').exists()).toBe(false)
    expect(w.text()).toContain('Select a model or enter a custom one')
  })

  it('shows no warning when the model is empty', async () => {
    seedAI({ model: '' })
    fetchMock.mockResolvedValue({ success: true, models: ['a'] })
    const w = await mountView()
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').exists()).toBe(false)
  })

  it('warns on empty model lists, fetch failures and thrown errors', async () => {
    seedAI()
    const w = await mountView()
    fetchMock.mockResolvedValueOnce({ success: true, models: [] })
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').text()).toContain('No models returned from the endpoint')

    fetchMock.mockResolvedValueOnce({ success: false, error: '401 Unauthorized' })
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').text()).toContain('401 Unauthorized')

    fetchMock.mockResolvedValueOnce({ success: false })
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').text()).toContain('Failed to fetch models')

    fetchMock.mockRejectedValueOnce(new Error('DNS'))
    await w.find('.btn-fetch-models').trigger('click')
    await flushPromises()
    expect(w.find('.warning').text()).toContain('DNS')
  })

  it('tests the connection and shows success details', async () => {
    seedAI()
    testMock.mockResolvedValue({
      success: true,
      response: 'pong',
      url: 'https://ai.example/v1/chat/completions',
    })
    const w = await mountView()
    await w.find('.btn-test').trigger('click')
    await flushPromises()
    expect(testMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-test' }))
    const result = w.find('.test-result')
    expect(result.classes()).toContain('success')
    expect(result.text()).toContain('Connection successful!')
    expect(result.text()).toContain('pong')
    expect(result.text()).toContain('https://ai.example/v1/chat/completions')
  })

  it('shows failure details for failed and thrown connection tests', async () => {
    seedAI()
    const w = await mountView()
    testMock.mockResolvedValueOnce({ success: false, error: 'Bad key' })
    await w.find('.btn-test').trigger('click')
    await flushPromises()
    expect(w.find('.test-result').classes()).toContain('error')
    expect(w.find('.test-result').text()).toContain('Bad key')

    testMock.mockRejectedValueOnce(new Error('timeout'))
    await w.find('.btn-test').trigger('click')
    await flushPromises()
    expect(w.find('.test-result').text()).toContain('timeout')
  })

  it('reset clears fetched models, test result and restores defaults', async () => {
    seedAI()
    fetchMock.mockResolvedValue({ success: true, models: ['x'] })
    testMock.mockResolvedValue({ success: true, response: 'ok' })
    const w = await mountView()
    await w.find('.btn-fetch-models').trigger('click')
    await w.find('.btn-test').trigger('click')
    await flushPromises()
    await w.find('.btn-secondary').trigger('click')
    expect(w.find('.test-result').exists()).toBe(false)
    expect(w.find('select#ai-model').exists()).toBe(false)
    expect(val(w, '#ai-endpoint')).toBe('https://api.openai.com/v1')
    expect(val(w, '#ai-api-key')).toBe('')
    expect(w.find('.save-message').text()).toContain('Reset to default values')
    vi.advanceTimersByTime(3000)
    await w.vm.$nextTick()
    expect(w.find('.save-message').exists()).toBe(false)
  })
})
