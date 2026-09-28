import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildSystemPrompt,
  messagesToOpenAI,
  streamChatCompletion,
  continueWithToolResults,
} from '../aiChatService'
import { aiTools } from '../aiTools'
import type { ChatMessage, ConversationContext } from '../../../types/aiChat'

const emptyContext: ConversationContext = { currentQuery: '', backend: null, ontology: null }

function setAISettings(settings: Record<string, unknown>) {
  localStorage.setItem('shiny:settings:ai', JSON.stringify(settings))
}

/** Build a fetch Response whose body streams the given text chunks */
function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  let i = 0
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  }
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function delta(d: Record<string, unknown>, finish: string | null = null) {
  return sse({ choices: [{ index: 0, delta: d, finish_reason: finish }] })
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const e of gen) out.push(e)
  return out
}

describe('aiChatService', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('buildSystemPrompt', () => {
    it('includes the base instructions and nothing contextual when context is empty', () => {
      const p = buildSystemPrompt(emptyContext)
      expect(p).toContain('SPARQL query assistant')
      expect(p).toContain('runSparqlQuery tool requires user approval')
      expect(p).not.toContain('getQueryContext')
      expect(p).not.toContain('RESPONSE LENGTH')
      expect(p).not.toContain('## Current Query')
      expect(p).not.toContain('## Connected Backend')
      expect(p).not.toContain('## Ontology Cache')
    })

    it('mentions the query context tool when enabled', () => {
      localStorage.setItem(
        'shiny:settings:query-context',
        JSON.stringify({ enabled: true, content: 'x' })
      )
      const p = buildSystemPrompt(emptyContext)
      expect(p.match(/getQueryContext/g)).toHaveLength(2)
    })

    it('adds response length guidance', () => {
      const p = buildSystemPrompt(emptyContext, 1000)
      expect(p).toContain('approximately 1000 tokens (~750 words)')
    })

    it('includes query, backend and ontology context', () => {
      const p = buildSystemPrompt({
        currentQuery: 'SELECT * WHERE { ?s ?p ?o }',
        backend: { name: 'Local', type: 'graphdb', endpoint: 'http://localhost:7200' },
        ontology: {
          classCount: 5,
          propertyCount: 3,
          individualCount: 1,
          namespaces: ['ex', 'foaf'],
        },
      })
      expect(p).toContain('```sparql\nSELECT * WHERE { ?s ?p ?o }\n```')
      expect(p).toContain('- Name: Local')
      expect(p).toContain('- Type: graphdb')
      expect(p).toContain('- Endpoint: http://localhost:7200')
      expect(p).toContain('- Classes: 5')
      expect(p).toContain('- Properties: 3')
      expect(p).toContain('- Individuals: 1')
      expect(p).toContain('- Available prefixes: ex, foaf')
    })

    it('omits prefixes line when there are no namespaces', () => {
      const p = buildSystemPrompt({
        ...emptyContext,
        ontology: { classCount: 0, propertyCount: 0, individualCount: 0, namespaces: [] },
      })
      expect(p).toContain('## Ontology Cache')
      expect(p).not.toContain('Available prefixes')
    })
  })

  describe('messagesToOpenAI', () => {
    it('converts user, assistant (with tool calls) and tool messages', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'hi', timestamp: 1 },
        {
          id: '2',
          role: 'assistant',
          content: '',
          timestamp: 2,
          toolCalls: [
            { id: 'tc1', name: 'searchOntology', arguments: { query: 'x' }, status: 'completed' },
          ],
        },
        { id: '3', role: 'tool', content: '{"ok":true}', timestamp: 3, toolCallId: 'tc1' },
        { id: '4', role: 'assistant', content: 'done', timestamp: 4, toolCalls: [] },
      ]
      expect(messagesToOpenAI(messages)).toEqual([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'searchOntology', arguments: '{"query":"x"}' },
            },
          ],
        },
        { role: 'tool', content: '{"ok":true}', tool_call_id: 'tc1' },
        { role: 'assistant', content: 'done' },
      ])
    })
  })

  describe('streamChatCompletion', () => {
    const userMsg: ChatMessage[] = [{ id: '1', role: 'user', content: 'hello', timestamp: 0 }]

    it('errors without calling the API when no API key is configured', async () => {
      const events = await collect(streamChatCompletion(userMsg, emptyContext))
      expect(events).toEqual([{ type: 'error', error: 'API key not configured' }])
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends a streaming request with system prompt, tools and settings', async () => {
      setAISettings({
        endpoint: 'https://ai.example.com/',
        model: 'm1',
        apiKey: 'sk-1',
        temperature: 0,
        maxTokens: 256,
      })
      fetchMock.mockResolvedValue(streamResponse([]))

      await collect(streamChatCompletion(userMsg, emptyContext))

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://ai.example.com/v1/chat/completions')
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe('Bearer sk-1')
      const body = JSON.parse(init.body)
      expect(body.model).toBe('m1')
      expect(body.stream).toBe(true)
      expect(body.temperature).toBe(0)
      expect(body.max_tokens).toBe(256)
      expect(body.tools).toEqual(aiTools)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[0].content).toContain('approximately 256 tokens')
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' })
    })

    it('falls back to default temperature/maxTokens when not set', async () => {
      setAISettings({ apiKey: 'k', temperature: null, maxTokens: null })
      fetchMock.mockResolvedValue(streamResponse([]))
      await collect(streamChatCompletion(userMsg, emptyContext))
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.temperature).toBe(0.7)
      expect(body.max_tokens).toBe(2000)
    })

    it('yields accumulated content deltas then done', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue(
        streamResponse([
          delta({ role: 'assistant' }),
          delta({ content: 'Hel' }),
          // A message split across two network chunks
          'data: {"choices":[{"index":0,"delta":{"content":"lo"},',
          '"finish_reason":null}]}\n\n',
          delta({}, 'stop'),
          'data: [DONE]\n\n',
        ])
      )
      const events = await collect(streamChatCompletion(userMsg, emptyContext))
      expect(events).toEqual([
        { type: 'content', content: 'Hel' },
        { type: 'content', content: 'Hello' },
        { type: 'done' },
      ])
    })

    it('assembles streamed tool calls and marks approval status', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue(
        streamResponse([
          delta({
            tool_calls: [
              { index: 0, id: 'call_a', function: { name: 'searchOntology', arguments: '{"que' } },
            ],
          }),
          delta({ tool_calls: [{ index: 0, function: { arguments: 'ry":"person"}' } }] }),
          delta({
            tool_calls: [
              { index: 1, function: { name: 'runSparqlQuery', arguments: '' } },
              { index: 1, id: 'call_b', function: { arguments: '{"query":"ASK {}"}' } },
            ],
          }),
          delta({}, 'tool_calls'),
        ])
      )
      const events = await collect(streamChatCompletion(userMsg, emptyContext))
      expect(events).toEqual([
        {
          type: 'tool_calls',
          toolCalls: [
            {
              id: 'call_a',
              name: 'searchOntology',
              arguments: { query: 'person' },
              status: 'approved',
            },
            {
              id: 'call_b',
              name: 'runSparqlQuery',
              arguments: { query: 'ASK {}' },
              status: 'pending',
            },
          ],
        },
        { type: 'done' },
      ])
    })

    it('uses empty arguments when tool call JSON is malformed', async () => {
      setAISettings({ apiKey: 'k' })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      fetchMock.mockResolvedValue(
        streamResponse([
          delta({
            tool_calls: [
              { index: 0, id: 'c', function: { name: 'getClassDetails', arguments: '{' } },
            ],
          }),
          delta({}, 'tool_calls'),
        ])
      )
      const events = await collect(streamChatCompletion(userMsg, emptyContext))
      expect((events[0] as any).toolCalls[0].arguments).toEqual({})
      expect(warn).toHaveBeenCalledWith('Failed to parse tool call arguments:', '{')
    })

    it('skips malformed SSE chunks, empty choices and non-data lines', async () => {
      setAISettings({ apiKey: 'k' })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      fetchMock.mockResolvedValue(
        streamResponse([
          ': keep-alive comment\n',
          'data: {broken\n',
          sse({ choices: [] }),
          delta({ content: 'ok' }),
        ])
      )
      const events = await collect(streamChatCompletion(userMsg, emptyContext))
      expect(events).toEqual([{ type: 'content', content: 'ok' }, { type: 'done' }])
      expect(warn).toHaveBeenCalledWith('Failed to parse SSE chunk:', '{broken', expect.anything())
    })

    it('reports the API error message on non-OK responses', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Incorrect API key' } }),
      })
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'Incorrect API key' },
      ])
    })

    it('falls back to status code when the error body is unusable', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('html')
        },
      })
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'API error: 500' },
      ])

      fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'API error: 429' },
      ])
    })

    it('errors when the response has no body', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue({ ok: true, status: 200, body: null })
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'No response body' },
      ])
    })

    it('yields network errors', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockRejectedValue(new Error('Failed to fetch'))
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'Failed to fetch' },
      ])
      fetchMock.mockRejectedValue('weird')
      expect(await collect(streamChatCompletion(userMsg, emptyContext))).toEqual([
        { type: 'error', error: 'Unknown error' },
      ])
    })
  })

  describe('continueWithToolResults', () => {
    it('delegates to the same streaming logic', async () => {
      setAISettings({ apiKey: 'k' })
      fetchMock.mockResolvedValue(streamResponse([delta({ content: 'after tools' })]))
      const messages: ChatMessage[] = [
        { id: '1', role: 'tool', content: '{}', timestamp: 0, toolCallId: 'c1' },
      ]
      const events = await collect(continueWithToolResults(messages, emptyContext))
      expect(events).toEqual([{ type: 'content', content: 'after tools' }, { type: 'done' }])
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.messages[1]).toEqual({ role: 'tool', content: '{}', tool_call_id: 'c1' })
    })
  })
})
