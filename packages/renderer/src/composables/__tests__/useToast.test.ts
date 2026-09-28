import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToast } from '../useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Toast state is module-global; drain anything left by a previous test
    const { toasts, remove } = useToast()
    for (const t of [...toasts.value]) remove(t.id)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an info toast by default and returns a unique id', () => {
    const { show, toasts } = useToast()
    const id1 = show('hello')
    const id2 = show('world')

    expect(id1).not.toBe(id2)
    expect(toasts.value).toHaveLength(2)
    expect(toasts.value[0]).toMatchObject({
      id: id1,
      message: 'hello',
      type: 'info',
      duration: 4000,
    })
  })

  it('auto-removes a toast after its duration', () => {
    const { show, toasts } = useToast()
    show('bye', 'success', 1000)
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(999)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.value).toHaveLength(0)
  })

  it('keeps a toast with duration 0 until removed manually', () => {
    const { show, remove, toasts } = useToast()
    const id = show('sticky', 'warning', 0)
    vi.advanceTimersByTime(60_000)
    expect(toasts.value).toHaveLength(1)

    remove(id)
    expect(toasts.value).toHaveLength(0)
  })

  it('ignores removal of an unknown id', () => {
    const { show, remove, toasts } = useToast()
    show('a', 'info', 0)
    remove('toast-does-not-exist')
    expect(toasts.value).toHaveLength(1)
  })

  it('provides typed helpers', () => {
    const { info, success, warning, error, toasts } = useToast()
    info('i', 0)
    success('s', 0)
    warning('w', 0)
    error('e', 0)
    expect(toasts.value.map((t) => [t.message, t.type])).toEqual([
      ['i', 'info'],
      ['s', 'success'],
      ['w', 'warning'],
      ['e', 'error'],
    ])
  })

  it('shares state across composable instances', () => {
    const a = useToast()
    const b = useToast()
    a.info('shared', 0)
    expect(b.toasts.value).toHaveLength(1)
  })
})
