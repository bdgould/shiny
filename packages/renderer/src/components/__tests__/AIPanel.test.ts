import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import AIPanel from '../sidebar/panels/AIPanel.vue'
import { useAIChatStore } from '@/stores/aiChat'
import { useTabsStore } from '@/stores/tabs'
import type { ToolCall } from '@/types/aiChat'
import { streamChatCompletion, continueWithToolResults } from '@/services/ai/aiChatService'
import { executeTool } from '@/services/ai/toolExecutor'
import { saveAISettings } from '@/services/preferences/appSettings'

type Chunk = {
  type: 'content' | 'tool_calls' | 'error' | 'done'
  content?: string
  toolCalls?: ToolCall[]
  error?: string
}

vi.mock('@/services/ai/aiChatService', () => ({
  streamChatCompletion: vi.fn(),
  continueWithToolResults: vi.fn(),
}))
vi.mock('@/services/ai/toolExecutor', () => ({ executeTool: vi.fn() }))

const streamMock = vi.mocked(streamChatCompletion)
const continueMock = vi.mocked(continueWithToolResults)
const executeMock = vi.mocked(executeTool)

function gen(chunks: Chunk[], throwAfter?: Error) {
  return (async function* () {
    for (const c of chunks) yield c
    if (throwAfter) throw throwAfter
  })()
}

const MessagesStub = defineComponent({
  name: 'AIChatMessages',
  props: { messages: { type: Array, required: true } },
  emits: ['approveToolCall', 'rejectToolCall'],
  template: '<div class="messages-stub">{{ messages.length }}</div>',
})

function tool(name: string, id = `tc-${name}`): ToolCall {
  return { id, name, arguments: {}, status: 'pending' }
}

let wrapper: VueWrapper

function configure() {
  localStorage.setItem(
    'shiny:settings:ai',
    JSON.stringify({ endpoint: 'https://ai.example/v1', model: 'm', apiKey: 'k' })
  )
}

function mountPanel() {
  wrapper = mount(AIPanel, { global: { stubs: { AIChatMessages: MessagesStub } } })
  return wrapper
}

async function send(text: string) {
  await wrapper.find('textarea').setValue(text)
  await wrapper.find('.send-button').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  streamMock.mockReset()
  continueMock.mockReset()
  executeMock.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
})

describe('AIPanel - not configured', () => {
  it('shows the configuration warning and disables input and quick actions', () => {
    const w = mountPanel()
    expect(w.find('.config-warning').exists()).toBe(true)
    expect(w.find('textarea').attributes('placeholder')).toBe('Configure AI to start chatting...')
    expect(w.find('textarea').attributes('disabled')).toBeDefined()
    expect(w.findAll('.action-button').every((b) => b.attributes('disabled') !== undefined)).toBe(
      true
    )
    expect(w.find('.status-dot').classes()).not.toContain('configured')
  })

  it('opens (or focuses) the AI settings tab from the warning link', async () => {
    const w = mountPanel()
    const tabs = useTabsStore()
    await w.find('.link-button').trigger('click')
    expect(tabs.tabs).toHaveLength(1)
    expect(tabs.activeTab?.settingsType).toBe('ai')

    const other = tabs.createTab()
    expect(tabs.activeTabId).toBe(other)
    await w.find('.link-button').trigger('click')
    expect(tabs.tabs).toHaveLength(2)
    expect(tabs.activeTab?.settingsType).toBe('ai')
  })

  it('clears the not-configured warning after AI settings are saved without a restart', async () => {
    const w = mountPanel()
    expect(w.find('.config-warning').exists()).toBe(true)
    saveAISettings({ endpoint: 'https://ai.example/v1', model: 'm', apiKey: 'sk-live' })
    await nextTick()
    expect(w.find('.config-warning').exists()).toBe(false)
    expect(w.find('textarea').attributes('disabled')).toBeUndefined()
    expect(w.find('textarea').attributes('placeholder')).toBe('Ask about your SPARQL query...')
    expect(w.find('.status-dot').classes()).toContain('configured')
  })
})

describe('AIPanel - configured', () => {
  beforeEach(configure)

  it('shows the ready placeholder and configured status', () => {
    const w = mountPanel()
    expect(w.find('.config-warning').exists()).toBe(false)
    expect(w.find('textarea').attributes('placeholder')).toBe('Ask about your SPARQL query...')
    expect(w.find('.status-dot').classes()).toContain('configured')
  })

  it('sends a message, streams the reply and finalizes it', async () => {
    streamMock.mockImplementation(() =>
      gen([
        { type: 'content', content: 'Hel' },
        { type: 'content', content: 'Hello!' },
        { type: 'done' },
      ])
    )
    mountPanel()
    await send('What does this do?')
    const store = useAIChatStore()
    expect(streamMock).toHaveBeenCalledTimes(1)
    // History passed to the service excludes the streaming placeholder
    const history = streamMock.mock.calls[0][0]
    expect(history.map((m) => m.content)).toEqual(['What does this do?'])
    expect(store.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'What does this do?'],
      ['assistant', 'Hello!'],
    ])
    expect(store.messages[1].isStreaming).toBe(false)
    expect(store.isLoading).toBe(false)
  })

  it('sends a quick action prompt', async () => {
    streamMock.mockImplementation(() => gen([{ type: 'content', content: 'ok' }]))
    const w = mountPanel()
    await w.findAll('.action-button')[0].trigger('click')
    await flushPromises()
    expect(useAIChatStore().messages[0].content).toBe(
      'Please explain what this SPARQL query does step by step.'
    )
  })

  it('shows streamed errors in a dismissible banner', async () => {
    streamMock.mockImplementation(() => gen([{ type: 'error', error: 'Rate limited' }]))
    const w = mountPanel()
    await send('hi')
    expect(w.find('.error-banner').text()).toContain('Rate limited')
    await w.find('.dismiss-button').trigger('click')
    expect(w.find('.error-banner').exists()).toBe(false)
  })

  it('shows thrown stream errors', async () => {
    streamMock.mockImplementation(() => gen([], new Error('Network down')))
    const w = mountPanel()
    await send('hi')
    expect(w.find('.error-banner').text()).toContain('Network down')
    expect(useAIChatStore().isLoading).toBe(false)
  })

  it('auto-executes non-approval tools and continues the conversation', async () => {
    const tabs = useTabsStore()
    const tabId = tabs.createTab({ backendId: 'b1' })
    expect(tabs.activeTabId).toBe(tabId)
    streamMock.mockImplementation(() =>
      gen([{ type: 'tool_calls', toolCalls: [tool('searchOntology')] }])
    )
    executeMock.mockResolvedValue({ success: true, result: { hits: 2 } })
    continueMock.mockImplementation(() => gen([{ type: 'content', content: 'Found 2' }]))
    mountPanel()
    await send('find classes')

    const store = useAIChatStore()
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'searchOntology' }), {
      backendId: 'b1',
    })
    const tc = store.findToolCall('tc-searchOntology')!.toolCall
    expect(tc.status).toBe('completed')
    expect(tc.result).toEqual({ hits: 2 })
    expect(store.messages.find((m) => m.role === 'tool')?.content).toBe('{"hits":2}')
    expect(continueMock).toHaveBeenCalledTimes(1)
    expect(store.messages[store.messages.length - 1].content).toBe('Found 2')
  })

  it('records tool failures (result error and thrown error)', async () => {
    streamMock.mockImplementation(() =>
      gen([{ type: 'tool_calls', toolCalls: [tool('a', 't1'), tool('b', 't2')] }])
    )
    executeMock
      .mockResolvedValueOnce({ success: false, error: 'bad args' })
      .mockRejectedValueOnce(new Error('exploded'))
    continueMock.mockImplementation(() => gen([{ type: 'error', error: 'LLM failed' }]))
    const w = mountPanel()
    await send('go')
    const store = useAIChatStore()
    expect(store.findToolCall('t1')!.toolCall).toMatchObject({ status: 'error', error: 'bad args' })
    expect(store.findToolCall('t2')!.toolCall).toMatchObject({ status: 'error', error: 'exploded' })
    expect(w.find('.error-banner').text()).toContain('LLM failed')
  })

  it('waits for approval on runSparqlQuery, then continues after approve', async () => {
    streamMock.mockImplementation(() =>
      gen([{ type: 'tool_calls', toolCalls: [tool('runSparqlQuery', 'q1')] }])
    )
    executeMock.mockResolvedValue({ success: true, result: [] })
    continueMock.mockImplementation(() => gen([{ type: 'content', content: 'done' }]))
    const w = mountPanel()
    await send('run it')
    expect(executeMock).not.toHaveBeenCalled()
    expect(continueMock).not.toHaveBeenCalled()
    expect(w.find('textarea').attributes('placeholder')).toBe(
      'Approve or reject pending tool calls...'
    )
    expect(w.find('textarea').attributes('disabled')).toBeDefined()

    const store = useAIChatStore()
    const msgId = store.findToolCall('q1')!.message.id
    w.findComponent(MessagesStub).vm.$emit('approveToolCall', msgId, 'q1')
    await flushPromises()
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(continueMock).toHaveBeenCalledTimes(1)
    expect(store.findToolCall('q1')!.toolCall.status).toBe('completed')
  })

  it('records a rejection and continues', async () => {
    streamMock.mockImplementation(() =>
      gen([{ type: 'tool_calls', toolCalls: [tool('runSparqlQuery', 'q1')] }])
    )
    continueMock.mockImplementation(() => gen([], new Error('continue failed')))
    const w = mountPanel()
    await send('run it')
    const store = useAIChatStore()
    const msgId = store.findToolCall('q1')!.message.id
    w.findComponent(MessagesStub).vm.$emit('rejectToolCall', msgId, 'q1')
    await flushPromises()
    expect(store.findToolCall('q1')!.toolCall.status).toBe('rejected')
    expect(store.messages.some((m) => m.content.includes('Tool call rejected by user'))).toBe(true)
    expect(executeMock).not.toHaveBeenCalled()
    expect(w.find('.error-banner').text()).toContain('continue failed')
  })

  it('clears the conversation from the header', async () => {
    streamMock.mockImplementation(() => gen([{ type: 'content', content: 'x' }]))
    const w = mountPanel()
    expect(w.find('.clear-button').exists()).toBe(false)
    await send('hi')
    await w.find('.clear-button').trigger('click')
    expect(useAIChatStore().messages).toHaveLength(0)
  })

  it('shows the waiting placeholder while loading', async () => {
    const w = mountPanel()
    useAIChatStore().setLoading(true)
    await w.vm.$nextTick()
    expect(w.find('textarea').attributes('placeholder')).toBe('Waiting for response...')
  })

  it('sends with Enter but not Shift+Enter', async () => {
    streamMock.mockImplementation(() => gen([{ type: 'content', content: 'x' }]))
    const w = mountPanel()
    await w.find('textarea').setValue('line')
    await w.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(streamMock).not.toHaveBeenCalled()
    await w.find('textarea').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(streamMock).toHaveBeenCalledTimes(1)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
})
