import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { ElectronAPI } from '../index'

type Listener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const exposed: Record<string, unknown> = {}
  return {
    listeners,
    exposed,
    exposeInMainWorld: vi.fn((key: string, api: unknown) => {
      exposed[key] = api
    }),
    ipcRenderer: {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
        const set = listeners.get(channel) ?? new Set()
        set.add(listener)
        listeners.set(channel, set)
      }),
      removeListener: vi.fn((channel: string, listener: (...args: any[]) => void) => {
        listeners.get(channel)?.delete(listener)
      }),
    },
  }
})

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: mocks.ipcRenderer,
}))

/** Simulate the main process sending an event on a channel. */
function emit(channel: string, ...args: unknown[]): void {
  const event = { sender: {} }
  for (const listener of [...(mocks.listeners.get(channel) ?? [])]) {
    ;(listener as Listener)(event, ...args)
  }
}

function listenerCount(channel: string): number {
  return mocks.listeners.get(channel)?.size ?? 0
}

let api: ElectronAPI
let exposeCalls: unknown[][] = []

beforeAll(async () => {
  await import('../index')
  // Snapshot now: mock call history may be cleared between tests
  exposeCalls = [...mocks.exposeInMainWorld.mock.calls]
  api = mocks.exposed.electronAPI as ElectronAPI
})

beforeEach(() => {
  mocks.ipcRenderer.invoke.mockReset()
  mocks.ipcRenderer.invoke.mockResolvedValue('ipc-result')
  mocks.ipcRenderer.on.mockClear()
  mocks.ipcRenderer.removeListener.mockClear()
  mocks.listeners.clear()
})

const creds = { username: 'u', password: 'p' }

describe('preload bridge', () => {
  it('exposes the API exactly once under "electronAPI"', () => {
    expect(exposeCalls).toHaveLength(1)
    expect(exposeCalls[0]).toEqual(['electronAPI', expect.any(Object)])
    expect(Object.keys(api).sort()).toEqual(
      ['backends', 'cache', 'files', 'graphdb', 'graphstudio', 'menu', 'mobi', 'query'].sort()
    )
  })

  it('never uses ipcRenderer.send (only request/response IPC)', async () => {
    await api.query.execute('SELECT * {}', 'b1')
    expect(mocks.ipcRenderer.send).not.toHaveBeenCalled()
  })

  describe('invoke-based methods', () => {
    const cases: Array<[string, () => Promise<unknown>, unknown[]]> = [
      [
        'query.execute',
        () => api.query.execute('SELECT * {}', 'b1'),
        ['query:execute', { query: 'SELECT * {}', backendId: 'b1' }],
      ],
      ['backends.getAll', () => api.backends.getAll(), ['backends:getAll']],
      [
        'backends.create',
        () => api.backends.create({ name: 'n' }, { token: 't' }),
        ['backends:create', { config: { name: 'n' }, credentials: { token: 't' } }],
      ],
      [
        'backends.update',
        () => api.backends.update('id1', { name: 'n2' }, creds),
        ['backends:update', { id: 'id1', updates: { name: 'n2' }, credentials: creds }],
      ],
      ['backends.delete', () => api.backends.delete('id1'), ['backends:delete', { id: 'id1' }]],
      [
        'backends.testConnection',
        () => api.backends.testConnection('id1'),
        ['backends:testConnection', { id: 'id1' }],
      ],
      [
        'backends.getCredentials',
        () => api.backends.getCredentials('id1'),
        ['backends:getCredentials', { id: 'id1' }],
      ],
      ['backends.getSelected', () => api.backends.getSelected(), ['backends:getSelected']],
      [
        'backends.setSelected',
        () => api.backends.setSelected(null),
        ['backends:setSelected', { id: null }],
      ],
      [
        'graphstudio.listGraphmarts',
        () => api.graphstudio.listGraphmarts('http://gs', creds, true),
        [
          'graphstudio:listGraphmarts',
          { baseUrl: 'http://gs', credentials: creds, allowInsecure: true },
        ],
      ],
      [
        'graphstudio.getGraphmartDetails',
        () => api.graphstudio.getGraphmartDetails('http://gs', 'urn:gm', creds, false),
        [
          'graphstudio:getGraphmartDetails',
          {
            baseUrl: 'http://gs',
            graphmartUri: 'urn:gm',
            credentials: creds,
            allowInsecure: false,
          },
        ],
      ],
      [
        'mobi.authenticate',
        () => api.mobi.authenticate('http://m', 'admin', 'secret', true),
        [
          'mobi:authenticate',
          { baseUrl: 'http://m', username: 'admin', password: 'secret', allowInsecure: true },
        ],
      ],
      [
        'mobi.listCatalogs',
        () => api.mobi.listCatalogs('http://m', creds),
        [
          'mobi:listCatalogs',
          { baseUrl: 'http://m', credentials: creds, allowInsecure: undefined },
        ],
      ],
      [
        'mobi.listRepositories',
        () => api.mobi.listRepositories('http://m', undefined, true),
        [
          'mobi:listRepositories',
          { baseUrl: 'http://m', credentials: undefined, allowInsecure: true },
        ],
      ],
      [
        'mobi.listRecords',
        () => api.mobi.listRecords('http://m', 'cat1', ['ont'], creds, false),
        [
          'mobi:listRecords',
          {
            baseUrl: 'http://m',
            catalogId: 'cat1',
            recordTypes: ['ont'],
            credentials: creds,
            allowInsecure: false,
          },
        ],
      ],
      [
        'mobi.listBranches',
        () => api.mobi.listBranches('http://m', 'cat1', 'rec1', creds, true),
        [
          'mobi:listBranches',
          {
            baseUrl: 'http://m',
            catalogId: 'cat1',
            recordId: 'rec1',
            credentials: creds,
            allowInsecure: true,
          },
        ],
      ],
      [
        'graphdb.authenticate',
        () => api.graphdb.authenticate('http://g', 'admin', 'root'),
        [
          'graphdb:authenticate',
          { baseUrl: 'http://g', username: 'admin', password: 'root', allowInsecure: undefined },
        ],
      ],
      [
        'graphdb.getServerInfo',
        () => api.graphdb.getServerInfo('http://g', creds, true),
        ['graphdb:getServerInfo', { baseUrl: 'http://g', credentials: creds, allowInsecure: true }],
      ],
      [
        'graphdb.listRepositories',
        () => api.graphdb.listRepositories('http://g', creds, false),
        [
          'graphdb:listRepositories',
          { baseUrl: 'http://g', credentials: creds, allowInsecure: false },
        ],
      ],
      [
        'graphdb.getRepositoryDetails',
        () => api.graphdb.getRepositoryDetails('http://g', 'repo', creds, true),
        [
          'graphdb:getRepositoryDetails',
          { baseUrl: 'http://g', repositoryId: 'repo', credentials: creds, allowInsecure: true },
        ],
      ],
      [
        'graphdb.testConnection',
        () => api.graphdb.testConnection('http://g', 'repo', undefined, false),
        [
          'graphdb:testConnection',
          {
            baseUrl: 'http://g',
            repositoryId: 'repo',
            credentials: undefined,
            allowInsecure: false,
          },
        ],
      ],
      [
        'files.saveQuery',
        () => api.files.saveQuery('SELECT', { id: 'b', name: 'B' }, '/tmp/q.rq'),
        ['files:saveQuery', 'SELECT', { id: 'b', name: 'B' }, '/tmp/q.rq'],
      ],
      ['files.openQuery', () => api.files.openQuery(), ['files:openQuery']],
      [
        'files.saveResults',
        () => api.files.saveResults('a,b', 'SELECT', 'csv'),
        ['files:saveResults', 'a,b', 'SELECT', 'csv'],
      ],
      ['files.openPrefixFile', () => api.files.openPrefixFile(), ['files:openPrefixFile']],
      [
        'cache.fetch',
        () => api.cache.fetch('b1', true),
        ['cache:fetch', { backendId: 'b1', onProgress: true }],
      ],
      [
        'cache.testQuery',
        () => api.cache.testQuery('b1', 'SELECT 1 {}'),
        ['cache:testQuery', { backendId: 'b1', query: 'SELECT 1 {}' }],
      ],
    ]

    it.each(cases)(
      '%s invokes the expected channel with the expected payload',
      async (_n, call, expected) => {
        const result = await call()
        expect(mocks.ipcRenderer.invoke).toHaveBeenCalledTimes(1)
        expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(...expected)
        expect(result).toBe('ipc-result')
      }
    )

    it('propagates rejections from the main process', async () => {
      mocks.ipcRenderer.invoke.mockRejectedValueOnce(new Error('boom'))
      await expect(api.backends.getAll()).rejects.toThrow('boom')
    })

    it('files.saveQuery passes null metadata and undefined path through', async () => {
      await api.files.saveQuery('ASK {}', null)
      expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith(
        'files:saveQuery',
        'ASK {}',
        null,
        undefined
      )
    })
  })

  describe('event subscriptions', () => {
    const menuCases: Array<[string, (cb: () => void) => () => void, string]> = [
      ['menu.onNewQuery', (cb) => api.menu.onNewQuery(cb), 'menu:newQuery'],
      ['menu.onSaveQuery', (cb) => api.menu.onSaveQuery(cb), 'menu:saveQuery'],
      ['menu.onOpenQuery', (cb) => api.menu.onOpenQuery(cb), 'menu:openQuery'],
      ['menu.onSaveResults', (cb) => api.menu.onSaveResults(cb), 'menu:saveResults'],
      ['menu.onFormatQuery', (cb) => api.menu.onFormatQuery(cb), 'menu:formatQuery'],
    ]

    it.each(menuCases)('%s registers on %s and unsubscribes cleanly', (_n, subscribe, channel) => {
      const cb = vi.fn()
      const unsubscribe = subscribe(cb)
      expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function))
      expect(listenerCount(channel)).toBe(1)

      emit(channel, 'ignored-arg')
      expect(cb).toHaveBeenCalledTimes(1)
      // Menu callbacks receive no arguments (the IPC event is not leaked)
      expect(cb).toHaveBeenCalledWith()

      unsubscribe()
      expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
        channel,
        mocks.ipcRenderer.on.mock.calls[0][1]
      )
      expect(listenerCount(channel)).toBe(0)
      emit(channel)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('files.onFileOpened forwards the payload without the IPC event', () => {
      const cb = vi.fn()
      const unsubscribe = api.files.onFileOpened(cb)
      const data = { content: 'SELECT', metadata: null, filePath: '/q.rq' }

      emit('file:opened', data)
      expect(cb).toHaveBeenCalledWith(data)
      expect(cb.mock.calls[0]).toHaveLength(1)

      unsubscribe()
      expect(listenerCount('file:opened')).toBe(0)
      emit('file:opened', data)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('cache.onProgress forwards progress payloads and unsubscribes', () => {
      const cb = vi.fn()
      const unsubscribe = api.cache.onProgress(cb)
      const data = { backendId: 'b1', progress: { status: 'loading' as const, fetchedCount: 5 } }

      emit('cache:progress', data)
      expect(cb).toHaveBeenCalledWith(data)

      unsubscribe()
      expect(listenerCount('cache:progress')).toBe(0)
      emit('cache:progress', data)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('unsubscribing one subscriber leaves others on the same channel intact', () => {
      const first = vi.fn()
      const second = vi.fn()
      const unsubFirst = api.menu.onNewQuery(first)
      const unsubSecond = api.menu.onNewQuery(second)
      expect(listenerCount('menu:newQuery')).toBe(2)

      unsubFirst()
      emit('menu:newQuery')
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)

      unsubSecond()
      expect(listenerCount('menu:newQuery')).toBe(0)
    })
  })
  describe('channel whitelist guard', () => {
    // Every channel the bridge uses is whitelisted, so the guard can only be exercised
    // by forcing the whitelist lookup to fail.
    function withWhitelistRejecting(fn: () => unknown): unknown {
      const spy = vi.spyOn(Array.prototype, 'includes').mockReturnValue(false)
      try {
        return fn()
      } finally {
        spy.mockRestore()
      }
    }

    const calls: Array<[string, () => unknown]> = [
      ['query.execute', () => api.query.execute('q', 'b')],
      ['backends.getAll', () => api.backends.getAll()],
      ['backends.create', () => api.backends.create({})],
      ['backends.update', () => api.backends.update('id', {})],
      ['backends.delete', () => api.backends.delete('id')],
      ['backends.testConnection', () => api.backends.testConnection('id')],
      ['backends.getCredentials', () => api.backends.getCredentials('id')],
      ['backends.getSelected', () => api.backends.getSelected()],
      ['backends.setSelected', () => api.backends.setSelected('id')],
      ['graphstudio.listGraphmarts', () => api.graphstudio.listGraphmarts('u')],
      ['graphstudio.getGraphmartDetails', () => api.graphstudio.getGraphmartDetails('u', 'g')],
      ['mobi.authenticate', () => api.mobi.authenticate('u', 'a', 'b')],
      ['mobi.listCatalogs', () => api.mobi.listCatalogs('u')],
      ['mobi.listRepositories', () => api.mobi.listRepositories('u')],
      ['mobi.listRecords', () => api.mobi.listRecords('u', 'c')],
      ['mobi.listBranches', () => api.mobi.listBranches('u', 'c', 'r')],
      ['graphdb.authenticate', () => api.graphdb.authenticate('u', 'a', 'b')],
      ['graphdb.getServerInfo', () => api.graphdb.getServerInfo('u')],
      ['graphdb.listRepositories', () => api.graphdb.listRepositories('u')],
      ['graphdb.getRepositoryDetails', () => api.graphdb.getRepositoryDetails('u', 'r')],
      ['graphdb.testConnection', () => api.graphdb.testConnection('u', 'r')],
      ['files.saveQuery', () => api.files.saveQuery('q', null)],
      ['files.openQuery', () => api.files.openQuery()],
      ['files.onFileOpened', () => api.files.onFileOpened(() => {})],
      ['files.saveResults', () => api.files.saveResults('c', 'SELECT', 'csv')],
      ['files.openPrefixFile', () => api.files.openPrefixFile()],
      ['menu.onNewQuery', () => api.menu.onNewQuery(() => {})],
      ['menu.onSaveQuery', () => api.menu.onSaveQuery(() => {})],
      ['menu.onOpenQuery', () => api.menu.onOpenQuery(() => {})],
      ['menu.onSaveResults', () => api.menu.onSaveResults(() => {})],
      ['menu.onFormatQuery', () => api.menu.onFormatQuery(() => {})],
      ['cache.fetch', () => api.cache.fetch('b')],
      ['cache.testQuery', () => api.cache.testQuery('b', 'q')],
      ['cache.onProgress', () => api.cache.onProgress(() => {})],
    ]

    it.each(calls)(
      '%s throws and does not touch IPC when the channel is not allowed',
      (_n, call) => {
        expect(() => withWhitelistRejecting(call)).toThrow('Unauthorized IPC channel')
        expect(mocks.ipcRenderer.invoke).not.toHaveBeenCalled()
        expect(mocks.ipcRenderer.on).not.toHaveBeenCalled()
      }
    )
  })
})
