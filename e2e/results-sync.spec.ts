import { test, expect, type Page } from '@playwright/test'
import { createServer, type Server } from 'http'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, type LaunchedApp } from './app'

// A stub SPARQL endpoint so a query can run end to end without a triple store.
// The results window mirrors the active tab over IPC; this guards the
// serialization of real (reactive) results across that boundary.
const BINDINGS = [
  { s: { type: 'uri', value: 'http://example.org/a' } },
  { s: { type: 'uri', value: 'http://example.org/b' } },
]
let requests = 0

let shiny: LaunchedApp
let server: Server
let seedDir: string

test.beforeAll(async () => {
  // Each request returns one more row than the last, so a re-run is visible
  server = createServer((_req, res) => {
    requests += 1
    const bindings = BINDINGS.slice(0, requests)
    res.writeHead(200, { 'Content-Type': 'application/sparql-results+json' })
    res.end(JSON.stringify({ head: { vars: ['s'] }, results: { bindings } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const backendId = '3f2b8c1e-0000-4000-8000-00000000e2e1'
  seedDir = mkdtempSync(join(tmpdir(), 'shiny-e2e-seed-'))
  const config = join(seedDir, 'shiny-config.json')
  writeFileSync(
    config,
    JSON.stringify({
      backends: [
        {
          id: backendId,
          name: 'Stub endpoint',
          type: 'sparql-1.1',
          endpoint: `http://127.0.0.1:${port}/sparql`,
          authType: 'none',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      credentials: {},
      selectedBackendId: backendId,
      schemaVersion: 1,
    })
  )
  shiny = await launchApp({ seedFiles: { 'shiny-config.json': config } })
})

test.afterAll(async () => {
  await shiny?.close()
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  if (seedDir) rmSync(seedDir, { recursive: true, force: true })
})

async function waitForResultsWindow(): Promise<Page> {
  const existing = shiny.app.windows().find((w) => w.url().endsWith('#results'))
  if (existing) return existing
  for (;;) {
    const next = await shiny.app.waitForEvent('window')
    if (next.url().endsWith('#results')) return next
  }
}

test('mirrors executed results into the popped-out window', async () => {
  const { window } = shiny
  const editor = window.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await window.keyboard.insertText('SELECT * WHERE { ?s ?p ?o } LIMIT 2')

  await window.locator('.backend-select').selectOption({ label: 'Stub endpoint' })
  const execute = window.locator('.editor-controls .btn-primary', { hasText: 'Execute' })
  await expect(execute).toBeEnabled()
  await execute.click()
  await expect(window.locator('.results-section .results')).toBeVisible()

  // Pop out with results already present: the first snapshot carries them
  await window.locator('button[title="Pop out results"]').click()
  const results = await waitForResultsWindow()
  await results.waitForLoadState('domcontentloaded')
  await expect(results.locator('.tab-name')).toHaveText('Untitled-1')
  const content = results.locator('.results-content')
  await expect(content.locator('.results')).toBeVisible()
  await expect(content).toContainText('.../a')
  await expect(content).toContainText(/1 rows?/)
  expect(requests).toBe(1)

  // Re-running from the results window round-trips through the main window
  await results.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(content).toContainText('.../b')
  await expect(content).toContainText('2 rows')
  expect(requests).toBe(2)

  await results.locator('.btn-pop-in').click()
  await expect(window.locator('.results-section .results')).toBeVisible()
})

test('starts without renderer errors', async () => {
  expect(shiny.errors).toEqual([])
})
