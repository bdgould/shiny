import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAIChatStore } from '../aiChat'
import { useTabsStore } from '../tabs'
import { useConnectionStore } from '../connection'
import { useOntologyCacheStore } from '../ontologyCache'
import type { BackendConfig } from '../../types/backends'
import type { ToolCall } from '../../types/aiChat'

const STORAGE_KEY = 'shiny:ai:conversation'
const AI_SETTINGS_KEY = 'shiny:settings:ai'

const backend: BackendConfig = {
  id: 'b1',
  name: 'GraphDB',
  type: 'graphdb',
  endpoint: 'http://localhost:7200',
  authType: 'basic',
  createdAt: 0,
  updatedAt: 0,
}

function toolCall(id: string, status: ToolCall['status'] = 'pending'): ToolCall {
  return { id, name: 'searchOntology', arguments: { q: 'x' }, status }
}

function persisted() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
}

function installLocalStorage() {
  const data = new Map<string, string>()
  const mock = {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, String(v))
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k)
    }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn(),
    length: 0,
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

describe('useAIChatStore', () => {
  beforeEach(() => {
    installLocalStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('starts empty and idle', () => {
      const store = useAIChatStore()
      expect(store.messages).toEqual([])
      expect(store.hasMessages).toBe(false)
      expect(store.isLoading).toBe(false)
      expect(store.isStreaming).toBe(false)
      expect(store.error).toBeNull()
      expect(store.hasPendingToolCalls).toBe(false)
    })

    it('restores persisted conversation and clears streaming flags', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          messages: [
            { id: '1', role: 'user', content: 'hi', timestamp: 1 },
            { id: '2', role: 'assistant', content: 'par', timestamp: 2, isStreaming: true },
          ],
          lastUpdated: 3,
        })
      )
      const store = useAIChatStore()
      expect(store.messages).toHaveLength(2)
      expect(store.messages.every((m) => m.isStreaming === false)).toBe(true)
      expect(store.hasMessages).toBe(true)
    })

    it('survives corrupt persisted data', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.setItem(STORAGE_KEY, 'not-json')
      const store = useAIChatStore()
      expect(store.messages).toEqual([])
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('isConfigured', () => {
    it('is false without an API key', () => {
      expect(useAIChatStore().isConfigured).toBe(false)
    })

    it('is true with api key and endpoint', () => {
      localStorage.setItem(
        AI_SETTINGS_KEY,
        JSON.stringify({ apiKey: 'sk-1', endpoint: 'https://x/v1' })
      )
      expect(useAIChatStore().isConfigured).toBe(true)
    })

    it('is false with an empty endpoint', () => {
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ apiKey: 'sk-1', endpoint: '' }))
      expect(useAIChatStore().isConfigured).toBe(false)
    })
  })

  describe('adding messages', () => {
    it('adds user, assistant and tool messages with unique ids and persists', () => {
      const store = useAIChatStore()
      const u = store.addUserMessage('hello')
      const a = store.addAssistantMessage('hi there', [toolCall('tc1')])
      const t = store.addToolMessage('tc1', '{"ok":true}')

      expect(store.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool'])
      expect(new Set([u.id, a.id, t.id]).size).toBe(3)
      expect(a.isStreaming).toBe(false)
      expect(a.toolCalls).toHaveLength(1)
      expect(t.toolCallId).toBe('tc1')

      const data = persisted()
      expect(data.messages).toHaveLength(3)
      expect(data.lastUpdated).toEqual(expect.any(Number))
    })

    it('trims to the last 100 messages', () => {
      const store = useAIChatStore()
      for (let i = 0; i < 105; i++) store.addUserMessage(`m${i}`)
      expect(store.messages).toHaveLength(100)
      expect(store.messages[0].content).toBe('m5')
      expect(store.messages[99].content).toBe('m104')
    })

    it('does not throw when persistence fails', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('quota')
      })
      const store = useAIChatStore()
      expect(() => store.addUserMessage('x')).not.toThrow()
      expect(store.messages).toHaveLength(1)
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('streaming messages', () => {
    it('creates, updates and finalizes a streaming message', () => {
      const store = useAIChatStore()
      const msg = store.startStreamingMessage()
      expect(msg.isStreaming).toBe(true)
      expect(msg.content).toBe('')
      // Not persisted while streaming
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      store.updateStreamingMessage(msg.id, 'Hel')
      expect(store.messages[0].content).toBe('Hel')
      expect(store.messages[0].toolCalls).toBeUndefined()

      store.updateStreamingMessage(msg.id, 'Hello', [toolCall('a')])
      expect(store.messages[0].content).toBe('Hello')
      expect(store.messages[0].toolCalls).toHaveLength(1)

      store.finalizeStreamingMessage(msg.id)
      expect(store.messages[0].isStreaming).toBe(false)
      expect(persisted().messages[0].content).toBe('Hello')
    })

    it('ignores unknown message ids', () => {
      const store = useAIChatStore()
      store.updateStreamingMessage('nope', 'x')
      store.finalizeStreamingMessage('nope')
      expect(store.messages).toEqual([])
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('tool calls', () => {
    it('tracks pending tool calls across messages', () => {
      const store = useAIChatStore()
      store.addAssistantMessage('a', [toolCall('1'), toolCall('2', 'completed')])
      store.addAssistantMessage('b', [toolCall('3')])
      expect(store.pendingToolCalls.map((t) => t.id)).toEqual(['1', '3'])
      expect(store.hasPendingToolCalls).toBe(true)
    })

    it('updates status, result, error and timing', () => {
      const store = useAIChatStore()
      const msg = store.addAssistantMessage('a', [toolCall('1')])

      store.updateToolCallStatus(msg.id, '1', 'executing', undefined, undefined, {
        startedAt: 100,
      })
      let tc = store.findToolCall('1')?.toolCall as ToolCall
      expect(tc.status).toBe('executing')
      expect(tc.startedAt).toBe(100)
      expect(tc.result).toBeUndefined()
      expect(store.hasPendingToolCalls).toBe(false)

      store.updateToolCallStatus(msg.id, '1', 'completed', { rows: 2 }, undefined, {
        completedAt: 150,
        latencyMs: 50,
      })
      tc = store.findToolCall('1')?.toolCall as ToolCall
      expect(tc).toMatchObject({
        status: 'completed',
        result: { rows: 2 },
        startedAt: 100,
        completedAt: 150,
        latencyMs: 50,
      })
      expect(tc.error).toBeUndefined()
      expect(persisted().messages[0].toolCalls[0].status).toBe('completed')

      store.updateToolCallStatus(msg.id, '1', 'error', undefined, 'boom')
      expect(store.findToolCall('1')?.toolCall.error).toBe('boom')
    })

    it('ignores unknown message or tool call ids', () => {
      const store = useAIChatStore()
      const msg = store.addAssistantMessage('a', [toolCall('1')])
      const noTools = store.addUserMessage('u')
      store.updateToolCallStatus('nope', '1', 'approved')
      store.updateToolCallStatus(msg.id, 'nope', 'approved')
      store.updateToolCallStatus(noTools.id, '1', 'approved')
      expect(store.findToolCall('1')?.toolCall.status).toBe('pending')
    })

    it('findToolCall returns the owning message or null', () => {
      const store = useAIChatStore()
      store.addUserMessage('u')
      const msg = store.addAssistantMessage('a', [toolCall('x')])
      const found = store.findToolCall('x')
      expect(found?.message.id).toBe(msg.id)
      expect(found?.toolCall.id).toBe('x')
      expect(store.findToolCall('missing')).toBeNull()
    })
  })

  describe('state setters and clearing', () => {
    it('sets error, loading and streaming flags', () => {
      const store = useAIChatStore()
      store.setError('bad')
      store.setLoading(true)
      store.setStreaming(true)
      expect(store.error).toBe('bad')
      expect(store.isLoading).toBe(true)
      expect(store.isStreaming).toBe(true)
      store.setError(null)
      expect(store.error).toBeNull()
    })

    it('clearConversation wipes messages, error and storage', () => {
      const store = useAIChatStore()
      store.addUserMessage('x')
      store.setError('e')
      store.clearConversation()
      expect(store.messages).toEqual([])
      expect(store.error).toBeNull()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('restoreConversation reloads from storage', () => {
      const store = useAIChatStore()
      store.addUserMessage('saved')
      store.messages = []
      store.restoreConversation()
      expect(store.messages.map((m) => m.content)).toEqual(['saved'])
    })
  })

  describe('buildContext', () => {
    it('returns empty context without an active tab', () => {
      const store = useAIChatStore()
      expect(store.buildContext()).toEqual({ currentQuery: '', backend: null, ontology: null })
    })

    it('includes query, backend (without credentials) and ontology stats', () => {
      const tabs = useTabsStore()
      const connection = useConnectionStore()
      const ontology = useOntologyCacheStore()
      connection.backends = [backend]
      tabs.createTab({ query: 'SELECT ?s {}', backendId: 'b1' })
      ontology.caches.set('b1', {
        metadata: {} as any,
        classes: [{} as any, {} as any],
        properties: [{} as any],
        individuals: [],
        namespaces: { ex: 'http://ex.org/', owl: 'http://www.w3.org/2002/07/owl#' },
      })

      const ctx = useAIChatStore().buildContext()
      expect(ctx).toEqual({
        currentQuery: 'SELECT ?s {}',
        backend: { name: 'GraphDB', type: 'graphdb', endpoint: 'http://localhost:7200' },
        ontology: {
          classCount: 2,
          propertyCount: 1,
          individualCount: 0,
          namespaces: ['ex', 'owl'],
        },
      })
      expect(ctx.backend).not.toHaveProperty('authType')
    })

    it('returns null backend/ontology when tab backend is unknown or uncached', () => {
      const tabs = useTabsStore()
      tabs.createTab({ query: 'q', backendId: 'ghost' })
      const ctx = useAIChatStore().buildContext()
      expect(ctx).toEqual({ currentQuery: 'q', backend: null, ontology: null })
    })

    it('returns null backend for a tab without backend', () => {
      const tabs = useTabsStore()
      useConnectionStore().backends = [backend]
      tabs.createTab({ query: 'q', backendId: null })
      expect(useAIChatStore().buildContext().backend).toBeNull()
    })
  })
})
