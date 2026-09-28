import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { handlers, fileService } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  fileService: {
    saveQuery: vi.fn(),
    openQuery: vi.fn(),
    saveResults: vi.fn(),
    openPrefixFile: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
  },
}))
vi.mock('../../services/FileService.js', () => ({ fileService }))

const okEvent = { senderFrame: { url: 'file:///app/index.html' } }

const channels: Record<string, any[]> = {
  'files:saveQuery': ['SELECT', null],
  'files:openQuery': [],
  'files:saveResults': ['a,b', 'SELECT', 'csv'],
  'files:openPrefixFile': [],
}

describe('files IPC handlers', () => {
  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await import('../files')
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(Object.entries(channels))('%s rejects unauthorized senders', async (channel, args) => {
    const fn = handlers.get(channel)!
    await expect(fn({ senderFrame: { url: 'https://evil.example' } }, ...args)).rejects.toThrow(
      'Unauthorized IPC sender'
    )
    await expect(fn({ senderFrame: null }, ...args)).rejects.toThrow('Unauthorized IPC sender')
    for (const m of Object.values(fileService)) expect(m).not.toHaveBeenCalled()
  })

  it('saveQuery delegates all arguments', async () => {
    fileService.saveQuery.mockResolvedValue({ success: true, filePath: '/q.rq' })
    const meta = { id: 'b', name: 'B' }
    await expect(
      handlers.get('files:saveQuery')!(okEvent, 'SELECT', meta, '/old.rq')
    ).resolves.toEqual({ success: true, filePath: '/q.rq' })
    expect(fileService.saveQuery).toHaveBeenCalledWith('SELECT', meta, '/old.rq')
  })

  it('openQuery delegates', async () => {
    fileService.openQuery.mockResolvedValue({ content: 'x', metadata: null, filePath: '/a' })
    await expect(handlers.get('files:openQuery')!(okEvent)).resolves.toEqual({
      content: 'x',
      metadata: null,
      filePath: '/a',
    })
  })

  it('saveResults delegates', async () => {
    fileService.saveResults.mockResolvedValue({ success: false })
    await expect(
      handlers.get('files:saveResults')!(okEvent, 'data', 'CONSTRUCT', 'turtle')
    ).resolves.toEqual({ success: false })
    expect(fileService.saveResults).toHaveBeenCalledWith('data', 'CONSTRUCT', 'turtle')
  })

  it('openPrefixFile delegates', async () => {
    fileService.openPrefixFile.mockResolvedValue({ content: '@prefix' })
    await expect(handlers.get('files:openPrefixFile')!(okEvent)).resolves.toEqual({
      content: '@prefix',
    })
  })
})
