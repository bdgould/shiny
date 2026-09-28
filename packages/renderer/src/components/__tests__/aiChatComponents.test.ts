import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AIChatMessages from '../sidebar/panels/ai/AIChatMessages.vue'
import AIChatMessage from '../sidebar/panels/ai/AIChatMessage.vue'
import ToolCallCard from '../sidebar/panels/ai/ToolCallCard.vue'
import { useTabsStore } from '@/stores/tabs'
import { useConnectionStore } from '@/stores/connection'
import type { ChatMessage, ToolCall } from '@/types/aiChat'

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: 'm1', role: 'assistant', content: '', timestamp: 0, ...overrides }
}

function tool(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 't1',
    name: 'searchOntology',
    arguments: { q: 'Person' },
    status: 'pending',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AIChatMessages', () => {
  it('shows the empty state with no messages', () => {
    const w = mount(AIChatMessages, { props: { messages: [] } })
    expect(w.find('.empty-state').text()).toContain('Ask me about your SPARQL query')
  })

  it('hides tool messages and forwards approve/reject with the message id', async () => {
    const tabs = useTabsStore()
    tabs.createTab({ backendId: 'b1' })
    useConnectionStore().backends = [
      {
        id: 'b1',
        name: 'B1',
        type: 'sparql-1.1',
        endpoint: 'https://x',
        authType: 'none',
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    const messages: ChatMessage[] = [
      msg({ id: 'u', role: 'user', content: 'hi' }),
      msg({ id: 'a', content: 'hello', toolCalls: [tool()] }),
      msg({ id: 't', role: 'tool', content: '{}', toolCallId: 't1' }),
    ]
    const w = mount(AIChatMessages, { props: { messages } })
    expect(w.findAllComponents(AIChatMessage)).toHaveLength(2)
    await w.find('.approve-btn').trigger('click')
    await w.find('.reject-btn').trigger('click')
    expect(w.emitted('approveToolCall')).toEqual([['a', 't1']])
    expect(w.emitted('rejectToolCall')).toEqual([['a', 't1']])

    await w.setProps({ messages: [...messages, msg({ id: 'z', content: 'more' })] })
    await flushPromises()
    expect(w.findAllComponents(AIChatMessage)).toHaveLength(3)
  })
})

describe('AIChatMessage', () => {
  it('renders user text as plain text', () => {
    const w = mount(AIChatMessage, {
      props: { message: msg({ role: 'user', content: '<b>x</b>' }) },
    })
    expect(w.find('.user-bubble').text()).toBe('<b>x</b>')
    expect(w.classes()).toContain('role-user')
  })

  it('renders assistant markdown and a typing indicator while streaming empty content', () => {
    const typing = mount(AIChatMessage, { props: { message: msg({ isStreaming: true }) } })
    expect(typing.find('.typing-indicator').exists()).toBe(true)
    const w = mount(AIChatMessage, { props: { message: msg({ content: '**bold**' }) } })
    expect(w.find('.markdown-content strong').text()).toBe('bold')
    expect(w.find('.typing-indicator').exists()).toBe(false)
  })

  it('renders the tool indicator for tool messages', () => {
    const w = mount(AIChatMessage, { props: { message: msg({ role: 'tool', content: '{}' }) } })
    expect(w.find('.tool-result-indicator').exists()).toBe(true)
  })

  it('copies code blocks via the Copy button', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = mount(AIChatMessage, {
      props: { message: msg({ content: '```sparql\nSELECT * WHERE { ?s ?p "<x>" }\n```' }) },
    })
    const btn = w.find('.copy-code-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p "<x>" }')
    expect(btn.text()).toBe('✓ Copied!')
    vi.advanceTimersByTime(2000)
    expect(btn.text()).toBe('Copy')

    writeText.mockRejectedValueOnce(new Error('denied'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await btn.trigger('click')
    await flushPromises()
    expect(err).toHaveBeenCalled()

    // Clicking elsewhere in the content does nothing
    writeText.mockClear()
    await w.find('.markdown-content').trigger('click')
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('ToolCallCard', () => {
  function withBackend() {
    useTabsStore().createTab({ backendId: 'b1' })
    useConnectionStore().backends = [
      {
        id: 'b1',
        name: 'DBpedia',
        type: 'sparql-1.1',
        endpoint: 'https://x',
        authType: 'none',
        createdAt: 0,
        updatedAt: 0,
      },
    ]
  }

  it('starts expanded for pending calls and shows target backend and actions', async () => {
    withBackend()
    const w = mount(ToolCallCard, { props: { toolCall: tool() } })
    expect(w.find('.tool-name').text()).toBe('Search Ontology')
    expect(w.find('.tool-icon').text()).toBe('🔍')
    expect(w.find('.status-badge').text()).toBe('Awaiting Approval')
    expect(w.find('.target-backend').text()).toContain('DBpedia')
    expect(w.find('.json-display').text()).toContain('"q": "Person"')
    await w.find('.approve-btn').trigger('click')
    await w.find('.reject-btn').trigger('click')
    expect(w.emitted('approve')).toHaveLength(1)
    expect(w.emitted('reject')).toHaveLength(1)
  })

  it('warns and disables approve when a backend tool has no backend', () => {
    useTabsStore().createTab()
    const w = mount(ToolCallCard, { props: { toolCall: tool({ name: 'runSparqlQuery' }) } })
    expect(w.find('.target-backend.warning').text()).toContain('No backend selected')
    expect(w.find('.approve-btn').attributes('disabled')).toBeDefined()
  })

  it('starts collapsed for completed calls and toggles to show output and latency', async () => {
    const w = mount(ToolCallCard, {
      props: {
        toolCall: tool({
          name: 'getQueryContext',
          status: 'completed',
          result: { ok: true },
          latencyMs: 250,
        }),
      },
    })
    expect(w.find('.tool-body').exists()).toBe(false)
    expect(w.find('.latency-badge').text()).toBe('250ms')
    expect(w.find('.status-badge').text()).toBe('Completed')
    await w.find('.tool-header').trigger('click')
    expect(w.find('.tool-body').text()).toContain('"ok": true')
    expect(w.find('.target-backend').exists()).toBe(false)
    expect(w.find('.tool-actions').exists()).toBe(false)
    expect(w.find('.expand-toggle').attributes('aria-label')).toBe('Collapse')
  })

  it('shows errors, seconds latency and falls back for unknown tool names/status', async () => {
    const w = mount(ToolCallCard, {
      props: {
        toolCall: tool({
          name: 'customTool',
          status: 'error',
          error: 'kaboom',
          latencyMs: 1500,
        }),
      },
    })
    expect(w.find('.tool-name').text()).toBe('customTool')
    expect(w.find('.tool-icon').text()).toBe('⚙')
    expect(w.find('.latency-badge').text()).toBe('1.50s')
    await w.find('.tool-header').trigger('click')
    expect(w.find('.error-display').text()).toBe('kaboom')

    await w.setProps({ toolCall: tool({ status: 'weird' as never }) })
    expect(w.find('.status-badge').text()).toBe('weird')
  })
})
