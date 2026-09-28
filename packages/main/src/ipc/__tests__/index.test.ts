import { describe, it, expect, vi } from 'vitest'

const { channels } = vi.hoisted(() => ({ channels: [] as string[] }))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((channel: string) => channels.push(channel)) },
}))
vi.mock('../../services/index.js', () => ({
  getBackendService: vi.fn(),
  getOntologyCacheService: vi.fn(),
}))
vi.mock('../../services/FileService.js', () => ({ fileService: {} }))
vi.mock('../../backends/BackendFactory.js', () => ({ BackendFactory: {} }))

describe('ipc/index', () => {
  it('registers handlers from every IPC module', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await import('../index.js')
    const prefixes = new Set(channels.map((c) => c.split(':')[0]))
    expect([...prefixes].sort()).toEqual(
      ['backends', 'cache', 'files', 'graphdb', 'graphstudio', 'mobi', 'query'].sort()
    )
    expect(new Set(channels).size).toBe(channels.length)
  })
})
