import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, client, create } = vi.hoisted(() => {
  const client = { get: vi.fn() }
  return {
    handlers: new Map<string, (...args: any[]) => any>(),
    client,
    create: vi.fn(() => client),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('axios', () => ({
  default: { create, isAxiosError: (e: any) => !!e?.isAxiosError },
}))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }
const BASE = 'https://anzo:8443'

function axiosError(status?: number, message = 'Request failed', data: any = {}) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: status ? { status, data } : undefined,
  })
}

function invoke(channel: string, event: any, args: any) {
  return handlers.get(channel)!(event, args)
}

describe('graphstudio IPC handlers', () => {
  beforeAll(async () => {
    await import('../graphstudio.js')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    client.get.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    ['graphstudio:listGraphmarts', { baseUrl: BASE }],
    ['graphstudio:getGraphmartDetails', { baseUrl: BASE, graphmartUri: 'g' }],
  ])('%s rejects unauthorized senders', async (channel, args) => {
    await expect(
      invoke(channel, { senderFrame: { url: 'http://localhost:5174' } }, args)
    ).rejects.toThrow('Unauthorized IPC sender')
    await expect(invoke(channel, { senderFrame: null }, args)).rejects.toThrow(
      'Unauthorized IPC sender'
    )
    expect(create).not.toHaveBeenCalled()
  })

  describe('graphstudio:listGraphmarts', () => {
    const list = (args: any) => invoke('graphstudio:listGraphmarts', okEvent, args)

    it.each([{}, { baseUrl: '' }, { baseUrl: 5 }])('requires a base URL', async (args) => {
      await expect(list(args)).rejects.toThrow('Base URL is required')
    })

    it('parses graphmarts, fetches status and sorts active first', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === `${BASE}/api/graphmarts`) {
          return {
            data: [
              { uri: 'http://g/one', title: 'One', layers: [{ id: 'l1' }] },
              { id: 'http://g/two', datasets: [{ uri: 'd', name: 'D', enabled: false }] },
              { '@id': 'http://g/three', label: 'Three', layerUris: ['http://l/a'] },
              { graphmartUri: 'x', dataSets: [{}] },
            ],
          }
        }
        if (url.includes(encodeURIComponent('http://g/one'))) return { data: { status: 'Failed' } }
        if (url.includes(encodeURIComponent('http://g/two'))) return { data: { state: 'Online' } }
        if (url.includes(encodeURIComponent('http://g/three'))) return { data: 'offline' }
        throw axiosError(500)
      })

      const result = await list({ baseUrl: BASE, credentials: { username: 'u', password: 'p' } })

      expect(result.map((g: any) => [g.name, g.status])).toEqual([
        ['two', 'active'],
        ['Three', 'inactive'],
        ['x', 'inactive'],
        ['One', 'error'],
      ])
      expect(result.find((g: any) => g.name === 'One').layers).toEqual([
        { uri: 'l1', name: 'Unnamed Layer', type: 'dataset', enabled: true },
      ])
      expect(result.find((g: any) => g.name === 'two').layers[0].enabled).toBe(false)
      expect(result.find((g: any) => g.name === 'Three').layers).toEqual([
        { uri: 'http://l/a', name: 'a', type: 'dataset', enabled: true },
      ])
      expect(client.get).toHaveBeenCalledWith(`${BASE}/api/graphmarts`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
        },
      })
    })

    it('falls back to API v1 and supports wrapped response shapes', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === `${BASE}/api/graphmarts`) throw axiosError(404)
        if (url === `${BASE}/api/v1/graphmarts`) {
          return { data: { graphmarts: [{ uri: 'http://g/a', name: 'A' }] } }
        }
        if (url.startsWith(`${BASE}/api/graphmarts/`)) throw axiosError(404)
        return { data: { status: 'Running' } }
      })
      const result = await list({ baseUrl: BASE })
      expect(result).toEqual([
        { uri: 'http://g/a', name: 'A', status: 'active', description: '', layers: [] },
      ])
      expect(client.get).toHaveBeenCalledWith(`${BASE}/api/v1/graphmarts`, {
        headers: { Accept: 'application/json' },
      })
    })

    it('supports the {result: [...]} shape and unknown shapes', async () => {
      client.get.mockResolvedValueOnce({ data: { result: [{ uri: 'u', description: 'd' }] } })
      client.get.mockRejectedValue(axiosError(500))
      const r1 = await list({ baseUrl: BASE })
      expect(r1).toEqual([
        { uri: 'u', name: 'u', status: 'inactive', description: 'd', layers: [] },
      ])

      client.get.mockReset()
      client.get.mockResolvedValueOnce({ data: { something: 'else' } })
      await expect(list({ baseUrl: BASE })).resolves.toEqual([])
    })

    it('names graphmarts without identifiers "Unnamed Graphmart"', async () => {
      client.get.mockResolvedValueOnce({ data: [{}] }).mockResolvedValue({ data: 42 })
      const result = await list({ baseUrl: BASE })
      expect(result[0].name).toBe('Unnamed Graphmart')
      expect(result[0].status).toBe('inactive')
    })

    it.each([
      [401, 'Authentication failed. Please check your credentials.'],
      [403, 'Authentication failed. Please check your credentials.'],
      [404, 'GraphStudio API not found. Please check the base URL.'],
      [500, 'Failed to fetch graphmarts (500): server says no'],
    ])('maps HTTP %s errors', async (status, message) => {
      client.get.mockRejectedValue(axiosError(status, 'x', { message: 'server says no' }))
      await expect(list({ baseUrl: BASE })).rejects.toThrow(message)
    })

    it('reports network errors', async () => {
      client.get.mockRejectedValue(axiosError(undefined, 'ECONNREFUSED'))
      await expect(list({ baseUrl: BASE })).rejects.toThrow(
        'Failed to fetch graphmarts (network error): ECONNREFUSED'
      )
    })

    it('wraps non-axios errors', async () => {
      client.get.mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b'))
      await expect(list({ baseUrl: BASE })).rejects.toThrow('Failed to fetch graphmarts: b')

      client.get.mockRejectedValueOnce('a').mockRejectedValueOnce('b')
      await expect(list({ baseUrl: BASE })).rejects.toThrow(
        'Failed to fetch graphmarts: Unknown error'
      )
    })
  })

  describe('graphstudio:getGraphmartDetails', () => {
    const details = (args: any) => invoke('graphstudio:getGraphmartDetails', okEvent, args)
    const GM = 'http://g/one'
    const enc = encodeURIComponent(GM)

    it('requires a base URL', async () => {
      await expect(details({ graphmartUri: GM })).rejects.toThrow('Base URL is required')
    })

    it('requires a graphmart URI', async () => {
      await expect(details({ baseUrl: BASE, graphmartUri: '' })).rejects.toThrow(
        'Graphmart URI is required'
      )
    })

    it('returns graphmart details with layers from the dedicated endpoint', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === `${BASE}/api/graphmarts/${enc}`) {
          return { data: { graphmart: { uri: GM, name: 'One', status: 'active' } } }
        }
        if (url === `${BASE}/api/graphmarts/${enc}/layers`) {
          return {
            data: [
              { uri: 'l1', title: 'Layer 1', type: 'view', enabled: false },
              { label: 'L2' },
              {},
            ],
          }
        }
        throw new Error('unexpected')
      })
      await expect(details({ baseUrl: BASE, graphmartUri: GM })).resolves.toEqual({
        uri: GM,
        name: 'One',
        status: 'active',
        description: '',
        layers: [
          { uri: 'l1', name: 'Layer 1', type: 'view', enabled: false },
          { uri: '', name: 'L2', type: 'dataset', enabled: true },
          { uri: '', name: 'Unnamed Layer', type: 'dataset', enabled: true },
        ],
      })
    })

    it('falls back to API v1 for both graphmart and layers', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url.startsWith(`${BASE}/api/graphmarts/`)) throw axiosError(404)
        if (url === `${BASE}/api/v1/graphmarts/${enc}`) return { data: { uri: GM, name: 'V1' } }
        if (url === `${BASE}/api/v1/graphmarts/${enc}/layers`) {
          return { data: { layers: [{ uri: 'l', name: 'N' }] } }
        }
        throw new Error('unexpected')
      })
      const gm = await details({ baseUrl: BASE, graphmartUri: GM })
      expect(gm.name).toBe('V1')
      expect(gm.layers).toEqual([{ uri: 'l', name: 'N', type: 'dataset', enabled: true }])
    })

    it('handles a layers response without a layers array', async () => {
      client.get
        .mockResolvedValueOnce({ data: { uri: GM } })
        .mockResolvedValueOnce({ data: { other: 1 } })
      const gm = await details({ baseUrl: BASE, graphmartUri: GM })
      expect(gm.layers).toEqual([])
    })

    it('keeps empty layers when layer fetch fails', async () => {
      client.get.mockImplementation(async (url: string) => {
        if (url === `${BASE}/api/graphmarts/${enc}`) {
          return { data: { uri: GM, layers: [{ uri: 'embedded' }] } }
        }
        throw axiosError(500)
      })
      const gm = await details({ baseUrl: BASE, graphmartUri: GM })
      expect(gm.layers).toEqual([])
    })

    it.each([
      [401, 'Authentication failed. Please check your credentials.'],
      [404, 'Graphmart not found.'],
      [502, 'Failed to fetch graphmart details (502): bad gateway'],
      [undefined, 'Failed to fetch graphmart details (network error): bad gateway'],
    ])('maps HTTP %s errors', async (status, message) => {
      client.get.mockRejectedValue(axiosError(status, 'bad gateway'))
      await expect(details({ baseUrl: BASE, graphmartUri: GM })).rejects.toThrow(message)
    })

    it('wraps non-axios errors', async () => {
      client.get.mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b'))
      await expect(details({ baseUrl: BASE, graphmartUri: GM })).rejects.toThrow(
        'Failed to fetch graphmart details: b'
      )
      client.get.mockRejectedValueOnce(1).mockRejectedValueOnce(2)
      await expect(details({ baseUrl: BASE, graphmartUri: GM })).rejects.toThrow(
        'Failed to fetch graphmart details: Unknown error'
      )
    })
  })
})
