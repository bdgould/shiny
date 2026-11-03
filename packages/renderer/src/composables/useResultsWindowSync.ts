import { toRaw, watch, type WatchStopHandle } from 'vue'
import { useTabsStore } from '@/stores/tabs'
import { useQueryStore } from '@/stores/query'
import { useResultsPaneStore } from '@/stores/resultsPane'
import type { ResultsWindowState } from '@/types/electron'

/**
 * Main-window side of the popped-out results window.
 *
 * Publishes a snapshot of the active tab whenever its results, error,
 * executing flag, query type or name change, answers the window's "ready"
 * request with a fresh snapshot, relays execute requests from it, and flips
 * the pane's popped-out flag when the window closes by any route.
 */
export function useResultsWindowSync() {
  const tabsStore = useTabsStore()
  const queryStore = useQueryStore()
  const resultsPane = useResultsPaneStore()
  const api = window.electronAPI.resultsWindow

  function snapshot(): ResultsWindowState {
    const tab = tabsStore.activeTab
    return {
      tabName: tab?.name ?? '',
      queryType: tab?.queryType ?? null,
      // The tab store wraps results in a reactive proxy, and Electron's IPC
      // cannot structured-clone a proxy ("An object could not be cloned"), so
      // send the raw response object.
      results: toRaw(tab?.results ?? null),
      error: tab?.error ?? null,
      isExecuting: tab?.isExecuting ?? false,
    }
  }

  async function publish(): Promise<void> {
    if (!resultsPane.isPoppedOut) return
    try {
      await api.publish(snapshot())
    } catch (error) {
      console.error('Failed to publish results to the results window:', error)
    }
  }

  async function popOut(): Promise<void> {
    try {
      const opened = await api.open()
      if (opened) {
        resultsPane.setPoppedOut(true)
        // The window asks for state once it loads; publishing here too covers
        // the case where it was already open and merely focused.
        await publish()
      }
    } catch (error) {
      console.error('Failed to open the results window:', error)
    }
  }

  async function popIn(): Promise<void> {
    try {
      await api.close()
    } catch (error) {
      console.error('Failed to close the results window:', error)
    }
    // The closed event normally clears the flag; clear it here as well so the
    // pane comes back even if that event is lost.
    resultsPane.setPoppedOut(false)
  }

  async function toggle(): Promise<void> {
    if (resultsPane.isPoppedOut) {
      await popIn()
    } else {
      await popOut()
    }
  }

  const stopWatch: WatchStopHandle = watch(
    () => {
      const tab = tabsStore.activeTab
      return [tab?.id, tab?.name, tab?.queryType, tab?.results, tab?.error, tab?.isExecuting]
    },
    () => void publish()
  )

  const removeClosed = api.onClosed(() => resultsPane.setPoppedOut(false))
  const removeReady = api.onReady(() => void publish())
  const removeExecute = api.onExecute(() => void queryStore.executeQuery())
  const removeToggle = window.electronAPI.menu.onToggleResultsWindow(() => void toggle())

  // If this renderer reloaded while the window was open, pick it back up
  void api
    .isOpen()
    .then(async (open) => {
      if (open) {
        resultsPane.setPoppedOut(true)
        await publish()
      }
    })
    .catch(() => undefined)

  function dispose(): void {
    stopWatch()
    removeClosed()
    removeReady()
    removeExecute()
    removeToggle()
  }

  return { popOut, popIn, toggle, publish, snapshot, dispose }
}
