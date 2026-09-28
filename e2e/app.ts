import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const repoRoot = resolve(__dirname, '..')

// Set SHINY_E2E_EXECUTABLE to a packaged binary (for example
// dist/mac-arm64/Shiny.app/Contents/MacOS/Shiny) to run the same tests
// against the production build, which loads the renderer from file://.
const packagedExecutable = process.env.SHINY_E2E_EXECUTABLE
const APP_URL = packagedExecutable ? 'file://' : 'http://localhost:5173'

export interface LaunchedApp {
  app: ElectronApplication
  window: Page
  userDataDir: string
  errors: string[]
  close: () => Promise<void>
}

/**
 * Launch Shiny against a throwaway profile so tests never touch real settings
 * or credentials. `--use-mock-keychain` keeps macOS from prompting for
 * keychain access when safeStorage initialises.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = realpathSync(mkdtempSync(join(tmpdir(), 'shiny-e2e-')))
  const args = [`--user-data-dir=${userDataDir}`, '--use-mock-keychain']
  if (!packagedExecutable) args.unshift(repoRoot)
  if (process.platform === 'linux') {
    // GitHub's Ubuntu runners cannot use Chromium's setuid sandbox, and there
    // is no keyring daemon, so fall back to the basic password store.
    args.push('--no-sandbox', '--password-store=basic')
  }

  const app = await electron.launch({
    args,
    cwd: repoRoot,
    // Packaged builds check GitHub for updates on launch; tests must not.
    env: { ...process.env, SHINY_DISABLE_UPDATES: '1' },
    ...(packagedExecutable ? { executablePath: resolve(repoRoot, packagedExecutable) } : {}),
  })

  // Dev mode also opens a DevTools window; pick the one serving the app.
  let window = app.windows().find((w) => w.url().startsWith(APP_URL))
  while (!window) {
    const next = await app.waitForEvent('window')
    if (next.url().startsWith(APP_URL)) window = next
    else await next.waitForLoadState().catch(() => undefined)
    window = window ?? app.windows().find((w) => w.url().startsWith(APP_URL))
  }

  const errors: string[] = []
  window.on('pageerror', (err) => errors.push(err.message))
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await window.waitForLoadState('domcontentloaded')

  return {
    app,
    window,
    userDataDir,
    errors,
    close: async () => {
      await app.close()
      rmSync(userDataDir, { recursive: true, force: true })
    },
  }
}
