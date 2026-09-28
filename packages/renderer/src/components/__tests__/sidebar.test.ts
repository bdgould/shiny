import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import IconSidebar from '../sidebar/IconSidebar.vue'
import SidebarIconBar from '../sidebar/SidebarIconBar.vue'
import SidebarDrawer from '../sidebar/SidebarDrawer.vue'
import DrawerResizer from '../sidebar/DrawerResizer.vue'
import { useSidebarStore } from '@/stores/sidebar'

const panelStubs = {
  ConnectionPanel: { template: '<div class="stub-connection" />' },
  AIPanel: { template: '<div class="stub-ai" />' },
  HistoryPanel: { template: '<div class="stub-history" />' },
  SettingsPanel: { template: '<div class="stub-settings" />' },
}

let wrapper: VueWrapper

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
})

describe('SidebarIconBar', () => {
  it('toggles panels and marks the active icon', async () => {
    wrapper = mount(SidebarIconBar)
    const store = useSidebarStore()
    const byTitle = (t: string) => wrapper.find(`button[title="${t}"]`)
    expect(wrapper.findAll('.icon-button')).toHaveLength(4)

    await byTitle('Connections').trigger('click')
    expect(store.activePanel).toBe('connection')
    expect(byTitle('Connections').classes()).toContain('active')

    await byTitle('AI Support Agent').trigger('click')
    expect(store.activePanel).toBe('ai')
    expect(byTitle('Connections').classes()).not.toContain('active')

    await byTitle('Query History').trigger('click')
    expect(store.activePanel).toBe('history')
    await byTitle('Settings').trigger('click')
    expect(store.activePanel).toBe('settings')

    await byTitle('Settings').trigger('click')
    expect(store.activePanel).toBeNull()
    expect(wrapper.findAll('.icon-button.active')).toHaveLength(0)
  })
})

describe('SidebarDrawer', () => {
  it('is hidden when no panel is active', () => {
    wrapper = mount(SidebarDrawer, { global: { stubs: panelStubs } })
    expect(wrapper.find('.sidebar-drawer').exists()).toBe(false)
  })

  it.each([
    ['connection', 'stub-connection'],
    ['ai', 'stub-ai'],
    ['history', 'stub-history'],
    ['settings', 'stub-settings'],
  ] as const)('renders the %s panel at the configured width', async (panel, cls) => {
    const store = useSidebarStore()
    store.setActivePanel(panel)
    store.setDrawerWidth(410)
    wrapper = mount(SidebarDrawer, { global: { stubs: panelStubs } })
    expect(wrapper.find(`.${cls}`).exists()).toBe(true)
    expect(wrapper.find('.sidebar-drawer').attributes('style')).toContain('width: 410px')
  })
})

describe('DrawerResizer', () => {
  it('resizes the drawer by dragging, clamped to 200-600px', async () => {
    const store = useSidebarStore()
    expect(store.drawerWidth).toBe(320)
    wrapper = mount(DrawerResizer)
    await wrapper.find('.drawer-resizer').trigger('mousedown', { clientX: 100 })

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }))
    expect(store.drawerWidth).toBe(370)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 1000 }))
    expect(store.drawerWidth).toBe(600)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000 }))
    expect(store.drawerWidth).toBe(200)

    document.dispatchEvent(new MouseEvent('mouseup'))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }))
    expect(store.drawerWidth).toBe(200)
    expect(localStorage.getItem('shiny:sidebar:drawerWidth')).toBe('200')
  })

  it('stops responding after unmount mid-drag', async () => {
    const store = useSidebarStore()
    wrapper = mount(DrawerResizer)
    await wrapper.find('.drawer-resizer').trigger('mousedown', { clientX: 100 })
    wrapper.unmount()
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }))
    expect(store.drawerWidth).toBe(320)
  })
})

describe('IconSidebar', () => {
  it('shows the resizer only while the drawer is open', async () => {
    wrapper = mount(IconSidebar, { global: { stubs: panelStubs } })
    expect(wrapper.findComponent(SidebarIconBar).exists()).toBe(true)
    expect(wrapper.findComponent(DrawerResizer).exists()).toBe(false)
    await wrapper.find('button[title="Query History"]').trigger('click')
    expect(wrapper.findComponent(DrawerResizer).exists()).toBe(true)
    expect(wrapper.find('.stub-history').exists()).toBe(true)
  })
})
