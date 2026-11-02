import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp } from './app'

let shiny: LaunchedApp

test.beforeAll(async () => {
  shiny = await launchApp()
})

test.afterAll(async () => {
  await shiny?.close()
})

/** Wait for the popped-out results window to appear. */
async function waitForResultsWindow(): Promise<Page> {
  const existing = shiny.app.windows().find((w) => w.url().endsWith('#results'))
  if (existing) return existing
  for (;;) {
    const next = await shiny.app.waitForEvent('window')
    if (next.url().endsWith('#results')) return next
  }
}

test('pops the results pane out into its own window and back in', async () => {
  const { window } = shiny
  await expect(window.locator('.results-section')).toBeVisible()

  await window.locator('button[title="Pop out results"]').click()
  const results = await waitForResultsWindow()
  await results.waitForLoadState('domcontentloaded')

  await expect(results.locator('.results-window-header')).toBeVisible()
  await expect(results.locator('.empty')).toContainText('No results yet')
  expect(await results.title()).toContain('Results')

  // The main window hands the pane over
  await expect(window.locator('.results-section')).toHaveCount(0)
  await expect(window.locator('.results-popped-out')).toBeVisible()

  // Popping back in from the results window restores the pane
  await results.locator('.btn-pop-in').click()
  await expect(window.locator('.results-popped-out')).toHaveCount(0)
  await expect(window.locator('.results-section')).toBeVisible()
})

test('restores the pane when the results window is closed by the OS', async () => {
  const { window } = shiny
  await window.locator('button[title="Pop out results"]').click()
  const results = await waitForResultsWindow()
  await results.waitForLoadState('domcontentloaded')
  await expect(window.locator('.results-popped-out')).toBeVisible()

  await shiny.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('#results')
    )
    win?.close()
  })

  await expect(window.locator('.results-popped-out')).toHaveCount(0)
  await expect(window.locator('.results-section')).toBeVisible()
})

test('starts without renderer errors', async () => {
  expect(shiny.errors).toEqual([])
})
