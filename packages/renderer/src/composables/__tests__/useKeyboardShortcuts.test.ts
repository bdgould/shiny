import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useKeyboardShortcuts, type KeyboardShortcut } from '../useKeyboardShortcuts'

const originalPlatform = navigator.platform

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}

function mountWith(shortcuts: KeyboardShortcut[]) {
  const Comp = defineComponent({
    setup() {
      useKeyboardShortcuts(shortcuts)
      return () => h('div')
    },
  })
  return mount(Comp)
}

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
  window.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    setPlatform(originalPlatform)
  })

  it('uses Ctrl as the modifier on non-Mac platforms', () => {
    setPlatform('Win32')
    const callback = vi.fn()
    const wrapper = mountWith([{ key: 's', ctrlOrCmd: true, callback }])

    press({ key: 's', metaKey: true })
    expect(callback).not.toHaveBeenCalled()

    const event = press({ key: 'S', ctrlKey: true })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('uses Cmd as the modifier on Mac', () => {
    setPlatform('MacIntel')
    const callback = vi.fn()
    const wrapper = mountWith([{ key: 'o', ctrlOrCmd: true, callback }])

    press({ key: 'o', ctrlKey: true })
    expect(callback).not.toHaveBeenCalled()

    press({ key: 'o', metaKey: true })
    expect(callback).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('requires exact modifier matches for shift and alt', () => {
    setPlatform('Linux x86_64')
    const plain = vi.fn()
    const shifted = vi.fn()
    const alted = vi.fn()
    const wrapper = mountWith([
      { key: 'k', ctrlOrCmd: true, shift: true, callback: shifted },
      { key: 'k', ctrlOrCmd: true, alt: true, callback: alted },
      { key: 'k', ctrlOrCmd: true, callback: plain },
    ])

    press({ key: 'k', ctrlKey: true, shiftKey: true })
    expect(shifted).toHaveBeenCalledTimes(1)
    expect(plain).not.toHaveBeenCalled()

    press({ key: 'k', ctrlKey: true, altKey: true })
    expect(alted).toHaveBeenCalledTimes(1)

    press({ key: 'k', ctrlKey: true })
    expect(plain).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not fire modifier-less shortcuts when ctrl/meta is held', () => {
    setPlatform('Win32')
    const callback = vi.fn()
    const wrapper = mountWith([{ key: 'F5', callback }])

    const unmatched = press({ key: 'F5', ctrlKey: true })
    expect(callback).not.toHaveBeenCalled()
    expect(unmatched.defaultPrevented).toBe(false)

    press({ key: 'f5' })
    expect(callback).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('only runs the first matching shortcut', () => {
    setPlatform('Win32')
    const first = vi.fn()
    const second = vi.fn()
    const wrapper = mountWith([
      { key: 'x', callback: first },
      { key: 'x', callback: second },
    ])
    press({ key: 'x' })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('removes the listener on unmount', () => {
    setPlatform('Win32')
    const callback = vi.fn()
    const wrapper = mountWith([{ key: 'z', callback }])
    wrapper.unmount()
    press({ key: 'z' })
    expect(callback).not.toHaveBeenCalled()
  })
})
