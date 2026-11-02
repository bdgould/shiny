import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  Menu: {
    buildFromTemplate: vi.fn((t: unknown) => ({ template: t })),
    setApplicationMenu: vi.fn(),
  },
  BrowserWindow: { getFocusedWindow: vi.fn() },
  app: { name: 'Shiny', getVersion: () => '1.2.3' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  dialog: { showMessageBox: vi.fn() },
  platform: 'darwin' as string,
}))

vi.mock('electron', () => ({
  Menu: mocks.Menu,
  BrowserWindow: mocks.BrowserWindow,
  app: mocks.app,
  shell: mocks.shell,
  dialog: mocks.dialog,
}))

import { createApplicationMenu } from '../menu'

type Item = { label?: string; role?: string; submenu?: Item[]; click?: () => unknown }

function buildMenu(checkForUpdates?: () => Promise<void>) {
  const mainWindow = { webContents: { send: vi.fn() } }
  createApplicationMenu(mainWindow as never, checkForUpdates)
  const template = mocks.Menu.buildFromTemplate.mock.calls.at(-1)?.[0] as Item[]
  return { mainWindow, template }
}

function findItem(items: Item[], label: string): Item | undefined {
  for (const item of items) {
    if (item.label === label) return item
    const nested = item.submenu && findItem(item.submenu, label)
    if (nested) return nested
  }
  return undefined
}

function click(items: Item[], label: string): unknown {
  const item = findItem(items, label)
  if (!item?.click) throw new Error(`no clickable menu item "${label}"`)
  return item.click()
}

describe('createApplicationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.BrowserWindow.getFocusedWindow.mockReturnValue(null)
  })

  it('installs the menu and routes File items to the main window', () => {
    const { mainWindow, template } = buildMenu()
    expect(mocks.Menu.setApplicationMenu).toHaveBeenCalledTimes(1)
    for (const [label, channel] of [
      ['New Query', 'menu:newQuery'],
      ['Open Query...', 'menu:openQuery'],
      ['Save Query...', 'menu:saveQuery'],
      ['Format Query', 'menu:formatQuery'],
      ['Toggle Results Window', 'menu:toggleResultsWindow'],
    ]) {
      findItem(template, label)!.click!()
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(channel)
    }
  })

  it('sends Save Results to the focused window, falling back to the main window', () => {
    const { mainWindow, template } = buildMenu()
    click(template, 'Save Results...')
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('menu:saveResults')

    const focused = { webContents: { send: vi.fn() } }
    mocks.BrowserWindow.getFocusedWindow.mockReturnValue(focused)
    click(template, 'Save Results...')
    expect(focused.webContents.send).toHaveBeenCalledWith('menu:saveResults')
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('shows the About dialog and opens the wiki when asked', async () => {
    mocks.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })
    const { template } = buildMenu()
    await click(template, 'About Shiny')
    expect(mocks.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'Shiny 1.2.3' })
    )
    expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://github.com/bdgould/shiny/wiki')

    mocks.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await click(template, 'About Shiny')
    expect(mocks.shell.openExternal).toHaveBeenCalledTimes(1)
  })

  it('offers Check for Updates only when a checker is supplied, and opens Learn More', async () => {
    expect(findItem(buildMenu().template, 'Check for Updates…')).toBeUndefined()
    const check = vi.fn().mockResolvedValue(undefined)
    const { template } = buildMenu(check)
    click(template, 'Check for Updates…')
    expect(check).toHaveBeenCalledTimes(1)
    await click(template, 'Learn More')
    expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://github.com/bdgould/shiny')
  })
})
