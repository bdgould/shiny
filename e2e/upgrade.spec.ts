import { test, expect } from '@playwright/test'
import { join } from 'path'
import { launchApp, type LaunchedApp } from './app'

// The fixture is a settings file in the exact format electron-store 8 wrote
// (tab-indented JSON). Upgrading electron-store, or anything else that touches
// storage, must keep reading existing users' profiles.
const LEGACY_CONFIG = join(__dirname, 'fixtures', 'shiny-config.electron-store-8.json')
const BACKEND_ID = '3f2b8c1e-0000-4000-8000-000000000001'

let shiny: LaunchedApp

test.beforeAll(async () => {
  shiny = await launchApp({ seedFiles: { 'shiny-config.json': LEGACY_CONFIG } })
})

test.afterAll(async () => {
  await shiny?.close()
})

test('loads backends saved by an earlier version', async () => {
  const backends = await shiny.window.evaluate(() =>
    (window as unknown as { electronAPI: any }).electronAPI.backends.getAll()
  )
  expect(backends).toEqual([
    expect.objectContaining({ id: BACKEND_ID, name: 'Team GraphDB', type: 'sparql-1.1' }),
  ])
})

test('keeps the previously selected backend', async () => {
  const selected = await shiny.window.evaluate(() =>
    (window as unknown as { electronAPI: any }).electronAPI.backends.getSelected()
  )
  expect(selected).toBe(BACKEND_ID)
})

test('does not add the first-run default backend to an existing profile', async () => {
  const names = await shiny.window.evaluate(async () =>
    (
      (await (window as unknown as { electronAPI: any }).electronAPI.backends.getAll()) as {
        name: string
      }[]
    ).map((b) => b.name)
  )
  expect(names).not.toContain('DBpedia')
})
