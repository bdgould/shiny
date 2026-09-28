import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let shiny: LaunchedApp

test.beforeAll(async () => {
  shiny = await launchApp()
})

test.afterAll(async () => {
  await shiny?.close()
})

test('uses an isolated profile', async () => {
  const userData = await shiny.app.evaluate(({ app }) => app.getPath('userData'))
  expect(userData).toBe(shiny.userDataDir)
})

test('opens the main window with the core layout', async () => {
  const { window } = shiny
  await expect(window.locator('.top-bar')).toBeVisible()
  await expect(window.locator('.tab-bar')).toBeVisible()
  await expect(window.locator('.monaco-editor').first()).toBeVisible()
  expect(await window.title()).toContain('Shiny')
})

test('keeps the renderer sandboxed and exposes only the preload bridge', async () => {
  const exposure = await shiny.window.evaluate(() => ({
    hasBridge: typeof (window as unknown as { electronAPI?: unknown }).electronAPI === 'object',
    hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
    hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
  }))
  expect(exposure).toEqual({ hasBridge: true, hasRequire: false, hasProcess: false })
})

test('creates the default backend on first run', async () => {
  const backends = await shiny.window.evaluate(async () => {
    const api = (window as unknown as { electronAPI: any }).electronAPI
    return api.backends.getAll()
  })
  expect(Array.isArray(backends)).toBe(true)
  expect(backends.length).toBeGreaterThan(0)
})

test('opens and closes tabs from the tab bar', async () => {
  const { window } = shiny
  const tabs = window.locator('.tab-bar .tab')
  const before = await tabs.count()

  await window.locator('.tab-new').click()
  await expect(tabs).toHaveCount(before + 1)

  await tabs.last().locator('.tab-close').click()
  await expect(tabs).toHaveCount(before)
})

test('starts without renderer errors', async () => {
  expect(shiny.errors).toEqual([])
})
