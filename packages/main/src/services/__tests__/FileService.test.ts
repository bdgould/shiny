import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dialog, fs } = vi.hoisted(() => ({
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  fs: { writeFile: vi.fn(), readFile: vi.fn() },
}))

vi.mock('electron', () => ({ dialog }))
vi.mock('fs', () => ({ promises: fs, default: { promises: fs } }))

import { FileService, fileService } from '../FileService'

describe('FileService', () => {
  let service: FileService

  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of [...Object.values(dialog), ...Object.values(fs)]) m.mockReset()
    fs.writeFile.mockResolvedValue(undefined)
    service = new FileService()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('exports a singleton instance', () => {
    expect(fileService).toBeInstanceOf(FileService)
  })

  describe('saveQuery', () => {
    it('writes the query with a backend metadata header', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/tmp/q.rq', canceled: false })
      fs.writeFile.mockResolvedValue(undefined)

      const result = await service.saveQuery('SELECT * {}', { id: 'b1', name: 'Local' })

      expect(result).toEqual({ success: true, filePath: '/tmp/q.rq' })
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/q.rq',
        '# Shiny Backend: {"id":"b1","name":"Local"}\nSELECT * {}',
        'utf-8'
      )
      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: 'query.rq' })
      )
    })

    it('writes just the query without metadata and uses the current path as default', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/a/b.rq', canceled: false })
      await service.saveQuery('ASK {}', null, '/a/b.rq')
      expect(fs.writeFile).toHaveBeenCalledWith('/a/b.rq', 'ASK {}', 'utf-8')
      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: '/a/b.rq' })
      )
    })

    it.each([[{ canceled: true, filePath: '/x' }], [{ canceled: false, filePath: undefined }]])(
      'returns unsuccessful when cancelled %#',
      async (dialogResult) => {
        dialog.showSaveDialog.mockResolvedValue(dialogResult)
        await expect(service.saveQuery('q', null)).resolves.toEqual({ success: false })
        expect(fs.writeFile).not.toHaveBeenCalled()
      }
    )

    it('reports write errors', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/ro/q.rq', canceled: false })
      fs.writeFile.mockRejectedValue(new Error('EACCES'))
      await expect(service.saveQuery('q', null)).resolves.toEqual({
        success: false,
        error: 'EACCES',
      })
    })

    it('reports non-Error failures as unknown', async () => {
      dialog.showSaveDialog.mockRejectedValue('nope')
      await expect(service.saveQuery('q', null)).resolves.toEqual({
        success: false,
        error: 'Unknown error',
      })
    })
  })

  describe('openQuery / readQueryFile', () => {
    it('reads the selected file and parses metadata', async () => {
      dialog.showOpenDialog.mockResolvedValue({ filePaths: ['/q.rq'], canceled: false })
      fs.readFile.mockResolvedValue('# Shiny Backend: {"id":"b1","name":"L"}\nSELECT *\n{ }\n')

      await expect(service.openQuery()).resolves.toEqual({
        content: 'SELECT *\n{ }',
        metadata: { id: 'b1', name: 'L' },
        filePath: '/q.rq',
      })
      expect(fs.readFile).toHaveBeenCalledWith('/q.rq', 'utf-8')
    })

    it('round-trips a saved query', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/r.rq', canceled: false })
      await service.saveQuery('SELECT ?s WHERE { ?s ?p ?o }', { id: 'x', name: 'X' })
      const written = fs.writeFile.mock.calls[0][1]
      fs.readFile.mockResolvedValue(written)
      await expect(service.readQueryFile('/r.rq')).resolves.toEqual({
        content: 'SELECT ?s WHERE { ?s ?p ?o }',
        metadata: { id: 'x', name: 'X' },
        filePath: '/r.rq',
      })
    })

    it('returns content with null metadata when there is no header', async () => {
      fs.readFile.mockResolvedValue('  # a normal comment\nSELECT 1  ')
      await expect(service.readQueryFile('/p.rq')).resolves.toEqual({
        content: '# a normal comment\nSELECT 1',
        metadata: null,
        filePath: '/p.rq',
      })
    })

    it('keeps the header line out of content even if its JSON is missing', async () => {
      fs.readFile.mockResolvedValue('# Shiny Backend: none\nSELECT 1')
      await expect(service.readQueryFile('/p.rq')).resolves.toMatchObject({
        content: 'SELECT 1',
        metadata: null,
      })
    })

    it('falls back to the full file when the metadata JSON is malformed', async () => {
      fs.readFile.mockResolvedValue('# Shiny Backend: {broken\nSELECT 1')
      await expect(service.readQueryFile('/p.rq')).resolves.toEqual({
        content: '# Shiny Backend: {broken\nSELECT 1',
        metadata: null,
        filePath: '/p.rq',
      })
    })

    it('returns an error for read failures', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      await expect(service.readQueryFile('/missing.rq')).resolves.toEqual({ error: 'ENOENT' })
      fs.readFile.mockRejectedValue(42)
      await expect(service.readQueryFile('/missing.rq')).resolves.toEqual({
        error: 'Unknown error',
      })
    })

    it.each([[{ canceled: true, filePaths: ['/x'] }], [{ canceled: false, filePaths: [] }]])(
      'returns "No file selected" when cancelled %#',
      async (dialogResult) => {
        dialog.showOpenDialog.mockResolvedValue(dialogResult)
        await expect(service.openQuery()).resolves.toEqual({ error: 'No file selected' })
        expect(fs.readFile).not.toHaveBeenCalled()
      }
    )

    it('reports dialog errors', async () => {
      dialog.showOpenDialog.mockRejectedValue(new Error('dialog failed'))
      await expect(service.openQuery()).resolves.toEqual({ error: 'dialog failed' })
      dialog.showOpenDialog.mockRejectedValue(null)
      await expect(service.openQuery()).resolves.toEqual({ error: 'Unknown error' })
    })
  })

  describe('openPrefixFile', () => {
    it('returns the file content', async () => {
      dialog.showOpenDialog.mockResolvedValue({ filePaths: ['/p.ttl'], canceled: false })
      fs.readFile.mockResolvedValue('@prefix ex: <http://ex/> .')
      await expect(service.openPrefixFile()).resolves.toEqual({
        content: '@prefix ex: <http://ex/> .',
      })
      expect(dialog.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([{ name: 'Turtle', extensions: ['ttl'] }]),
        })
      )
    })

    it('returns an error when cancelled', async () => {
      dialog.showOpenDialog.mockResolvedValue({ filePaths: [], canceled: true })
      await expect(service.openPrefixFile()).resolves.toEqual({ error: 'No file selected' })
    })

    it('returns read errors', async () => {
      dialog.showOpenDialog.mockResolvedValue({ filePaths: ['/p.ttl'], canceled: false })
      fs.readFile.mockRejectedValue(new Error('EISDIR'))
      await expect(service.openPrefixFile()).resolves.toEqual({ error: 'EISDIR' })
      fs.readFile.mockRejectedValue(undefined)
      await expect(service.openPrefixFile()).resolves.toEqual({ error: 'Unknown error' })
    })
  })

  describe('saveResults', () => {
    it.each([
      ['csv', 'csv', 'CSV'],
      ['json', 'json', 'JSON'],
      ['turtle', 'ttl', 'Turtle'],
      ['trig', 'trig', 'TriG'],
      ['ntriples', 'nt', 'N-Triples'],
      ['nquads', 'nq', 'N-Quads'],
      ['jsonld', 'jsonld', 'JSON-LD'],
      ['xml', 'txt', 'Text'],
    ])('uses the right extension for %s', async (format, ext, filterName) => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: `/out.${ext}`, canceled: false })
      await expect(service.saveResults('data', 'SELECT', format)).resolves.toEqual({
        success: true,
        filePath: `/out.${ext}`,
      })
      expect(dialog.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: `results.${ext}`,
          filters: [
            { name: filterName, extensions: [ext] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })
      )
      expect(fs.writeFile).toHaveBeenCalledWith(`/out.${ext}`, 'data', 'utf-8')
    })

    it('returns unsuccessful when cancelled', async () => {
      dialog.showSaveDialog.mockResolvedValue({ canceled: true })
      await expect(service.saveResults('d', 'SELECT', 'csv')).resolves.toEqual({ success: false })
      expect(fs.writeFile).not.toHaveBeenCalled()
    })

    it('reports write errors', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/x.csv', canceled: false })
      fs.writeFile.mockRejectedValue(new Error('ENOSPC'))
      await expect(service.saveResults('d', 'SELECT', 'csv')).resolves.toEqual({
        success: false,
        error: 'ENOSPC',
      })
      fs.writeFile.mockRejectedValue('x')
      await expect(service.saveResults('d', 'SELECT', 'csv')).resolves.toEqual({
        success: false,
        error: 'Unknown error',
      })
    })
  })
})
