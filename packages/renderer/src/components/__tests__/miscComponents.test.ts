import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TopBar from '../layout/TopBar.vue'
import FormatSelectorDialog from '../dialogs/FormatSelectorDialog.vue'
import ToastContainer from '../ui/ToastContainer.vue'
import { useToast } from '@/composables/useToast'

describe('TopBar', () => {
  it('renders the app name, logo and subtitle', () => {
    const w = mount(TopBar)
    expect(w.find('h1').text()).toContain('Shiny')
    expect(w.find('img').attributes('alt')).toBe('Shiny Logo')
    expect(w.find('.subtitle').text()).toBe('SPARQL Client')
  })
})

describe('FormatSelectorDialog', () => {
  const formats = [
    { value: 'csv', label: 'CSV' },
    { value: 'turtle', label: 'Turtle' },
    { value: 'ntriples', label: 'N-Triples' },
    { value: 'custom', label: 'Custom' },
  ]

  function mountDialog() {
    return mount(FormatSelectorDialog, { props: { formats } })
  }

  it('is closed until open() is called', async () => {
    const w = mountDialog()
    expect(w.find('.dialog-overlay').exists()).toBe(false)
    ;(w.vm as unknown as { open: () => void }).open()
    await w.vm.$nextTick()
    expect(w.find('.dialog-overlay').exists()).toBe(true)
  })

  it('lists formats with their file extensions', async () => {
    const w = mountDialog()
    ;(w.vm as unknown as { open: () => void }).open()
    await w.vm.$nextTick()
    const opts = w
      .findAll('.format-option')
      .map((o) => [o.find('.format-label').text(), o.find('.format-extension').text()])
    expect(opts).toEqual([
      ['CSV', '.csv'],
      ['Turtle', '.ttl'],
      ['N-Triples', '.nt'],
      ['Custom', '.custom'],
    ])
  })

  it('emits select then close when a format is chosen', async () => {
    const w = mountDialog()
    ;(w.vm as unknown as { open: () => void }).open()
    await w.vm.$nextTick()
    await w.findAll('.format-option')[1].trigger('click')
    expect(w.emitted('select')).toEqual([['turtle']])
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.find('.dialog-overlay').exists()).toBe(false)
  })

  it.each(['.btn-close', '.btn-secondary', '.dialog-overlay'])(
    'closes via %s without selecting',
    async (selector) => {
      const w = mountDialog()
      ;(w.vm as unknown as { open: () => void }).open()
      await w.vm.$nextTick()
      await w.find(selector).trigger('click')
      expect(w.emitted('close')).toHaveLength(1)
      expect(w.emitted('select')).toBeUndefined()
      expect(w.find('.dialog-overlay').exists()).toBe(false)
    }
  )

  it('does not close when clicking inside the dialog body', async () => {
    const w = mountDialog()
    ;(w.vm as unknown as { open: () => void }).open()
    await w.vm.$nextTick()
    await w.find('.dialog').trigger('click')
    expect(w.emitted('close')).toBeUndefined()
    expect(w.find('.dialog-overlay').exists()).toBe(true)
  })
})

describe('ToastContainer', () => {
  const toast = useToast()

  beforeEach(() => {
    vi.useFakeTimers()
    for (const t of [...toast.toasts.value]) toast.remove(t.id)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders toasts of each type with the right icon and class', async () => {
    const w = mount(ToastContainer)
    toast.info('Info msg')
    toast.success('Saved')
    toast.warning('Careful')
    toast.error('Broken')
    await w.vm.$nextTick()
    const items = w.findAll('.toast')
    expect(items.map((t) => t.find('.toast-icon').text())).toEqual(['ℹ', '✓', '⚠', '✕'])
    expect(items.map((t) => t.find('.toast-message').text())).toEqual([
      'Info msg',
      'Saved',
      'Careful',
      'Broken',
    ])
    expect(items[1].classes()).toContain('toast-success')
    expect(items[3].classes()).toContain('toast-error')
  })

  it('removes a toast when clicked', async () => {
    const w = mount(ToastContainer)
    toast.show('Click me', 'info', 0)
    toast.show('Stay', 'info', 0)
    await w.vm.$nextTick()
    await w.findAll('.toast')[0].trigger('click')
    expect(toast.toasts.value.map((t) => t.message)).toEqual(['Stay'])
  })

  it('auto-dismisses after the duration', async () => {
    const w = mount(ToastContainer)
    toast.show('Temporary', 'info', 1000)
    await w.vm.$nextTick()
    expect(w.findAll('.toast')).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(toast.toasts.value).toHaveLength(0)
  })
})
