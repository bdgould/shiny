import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useResultsWindowSync } from '../useResultsWindowSync'
import { useTabsStore } from '@/stores/tabs'
import { useResultsPaneStore } from '@/stores/resultsPane'

type Fn = ReturnType<typeof vi.fn>

describe('useResultsWindowSync', () => {
  let rw: Record<string, Fn>
  let menu: Record<string, Fn>
  let execute: Fn
  const callbacks: Record<string, () => void> = {}
  let dispose: (() => void) | null = null

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    rw = window.electronAPI.resultsWindow as unknown as Record<string, Fn>
    menu = window.electronAPI.menu as unknown as Record<string, Fn>
    execute = vi.fn().mockResolvedValue({ queryType: 'ASK', data: { head: {}, boolean: true } })
    window.electronAPI.query.execute = execute as never
    for (const fn of [...Object.values(rw), ...Object.values(menu)]) fn.mockReset()
    rw.open.mockResolvedValue(true)
    rw.close.mockResolvedValue(undefined)
    rw.isOpen.mockResolvedValue(false)
    rw.publish.mockResolvedValue(true)
    for (const [name, key] of [
      ['onClosed', 'closed'],
      ['onReady', 'ready'],
      ['onExecute', 'execute'],
    ] as const) {
      rw[name].mockImplementation((cb: () => void) => {
        callbacks[key] = cb
        return vi.fn()
      })
    }
    menu.onToggleResultsWindow.mockImplementation((cb: () => void) => {
      callbacks.toggle = cb
      return vi.fn()
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    dispose?.()
    dispose = null
    vi.restoreAllMocks()
  })

  function start() {
    const sync = useResultsWindowSync()
    dispose = sync.dispose
    return sync
  }

  it('snapshots the active tab', () => {
    const tabs = useTabsStore()
    const id = tabs.createTab({ name: 'people' })
    tabs.setTabResults(id, { data: { x: 1 }, queryType: 'SELECT' }, 'SELECT')
    const { snapshot } = start()
    expect(snapshot()).toEqual({
      tabName: 'people',
      queryType: 'SELECT',
      results: { data: { x: 1 }, queryType: 'SELECT' },
      error: null,
      isExecuting: false,
    })
  })

  it('snapshots an empty state with no tabs', () => {
    const { snapshot } = start()
    expect(snapshot()).toEqual({
      tabName: '',
      queryType: null,
      results: null,
      error: null,
      isExecuting: false,
    })
  })

  it('popOut opens the window, flags the pane and publishes', async () => {
    useTabsStore().createTab({ name: 'q1' })
    const { popOut } = start()
    await popOut()
    expect(rw.open).toHaveBeenCalledTimes(1)
    expect(useResultsPaneStore().isPoppedOut).toBe(true)
    expect(rw.publish).toHaveBeenCalledWith(expect.objectContaining({ tabName: 'q1' }))
  })

  it('popOut leaves the pane alone when the main process declines', async () => {
    rw.open.mockResolvedValue(false)
    const { popOut } = start()
    await popOut()
    expect(useResultsPaneStore().isPoppedOut).toBe(false)
    expect(rw.publish).not.toHaveBeenCalled()
  })

  it('popIn closes the window and clears the flag even if the closed event never arrives', async () => {
    const pane = useResultsPaneStore()
    pane.setPoppedOut(true)
    const { popIn } = start()
    await popIn()
    expect(rw.close).toHaveBeenCalledTimes(1)
    expect(pane.isPoppedOut).toBe(false)
  })

  it('toggle flips between the two', async () => {
    const pane = useResultsPaneStore()
    const { toggle } = start()
    await toggle()
    expect(rw.open).toHaveBeenCalledTimes(1)
    expect(pane.isPoppedOut).toBe(true)
    await toggle()
    expect(rw.close).toHaveBeenCalledTimes(1)
    expect(pane.isPoppedOut).toBe(false)
  })

  it('publishes only while popped out, on every relevant tab change', async () => {
    const tabs = useTabsStore()
    const id = tabs.createTab({ name: 'q' })
    start()
    tabs.setTabExecuting(id, true)
    await nextTick()
    expect(rw.publish).not.toHaveBeenCalled()

    useResultsPaneStore().setPoppedOut(true)
    tabs.setTabExecuting(id, false)
    await nextTick()
    expect(rw.publish).toHaveBeenCalledTimes(1)
    expect(rw.publish).toHaveBeenLastCalledWith(expect.objectContaining({ isExecuting: false }))

    tabs.setTabError(id, 'boom')
    await nextTick()
    expect(rw.publish).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'boom' }))

    const other = tabs.createTab({ name: 'other' })
    await nextTick()
    expect(rw.publish).toHaveBeenLastCalledWith(expect.objectContaining({ tabName: 'other' }))
    tabs.setActiveTab(id)
    await nextTick()
    expect(rw.publish).toHaveBeenLastCalledWith(expect.objectContaining({ tabName: 'q' }))
    expect(other).not.toBe(id)
  })

  it('reacts to closed, ready, execute and the menu toggle', async () => {
    const pane = useResultsPaneStore()
    const tabs = useTabsStore()
    tabs.createTab({ query: 'ASK {}', backendId: 'b1' })
    start()

    pane.setPoppedOut(true)
    callbacks.closed()
    expect(pane.isPoppedOut).toBe(false)

    pane.setPoppedOut(true)
    callbacks.ready()
    await Promise.resolve()
    expect(rw.publish).toHaveBeenCalledTimes(1)

    callbacks.execute()
    await Promise.resolve()
    expect(execute).toHaveBeenCalledWith('ASK {}', 'b1')

    pane.setPoppedOut(false)
    callbacks.toggle()
    await Promise.resolve()
    await Promise.resolve()
    expect(rw.open).toHaveBeenCalledTimes(1)
  })

  it('picks up an already-open window after a renderer reload', async () => {
    rw.isOpen.mockResolvedValue(true)
    useTabsStore().createTab({ name: 'q' })
    start()
    await Promise.resolve()
    await Promise.resolve()
    expect(useResultsPaneStore().isPoppedOut).toBe(true)
    expect(rw.publish).toHaveBeenCalledWith(expect.objectContaining({ tabName: 'q' }))
  })

  it('logs and carries on when the bridge rejects', async () => {
    rw.open.mockRejectedValue(new Error('no bridge'))
    rw.close.mockRejectedValue(new Error('no bridge'))
    rw.publish.mockRejectedValue(new Error('no bridge'))
    const pane = useResultsPaneStore()
    const { popOut, popIn, publish } = start()
    await popOut()
    expect(pane.isPoppedOut).toBe(false)
    pane.setPoppedOut(true)
    await publish()
    await popIn()
    expect(pane.isPoppedOut).toBe(false)
    expect(console.error).toHaveBeenCalledTimes(3)
  })

  it('dispose unsubscribes everything', () => {
    const unsub = vi.fn()
    for (const name of ['onClosed', 'onReady', 'onExecute']) rw[name].mockReturnValue(unsub)
    menu.onToggleResultsWindow.mockReturnValue(unsub)
    const sync = useResultsWindowSync()
    sync.dispose()
    expect(unsub).toHaveBeenCalledTimes(4)
  })
})
