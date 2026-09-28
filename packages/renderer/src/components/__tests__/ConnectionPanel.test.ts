import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ConnectionPanel from '../sidebar/panels/ConnectionPanel.vue'
import type { BackendConfig } from '@/types/backends'
import type { BackendFormData } from '@/composables/useBackendValidation'

const BackendListStub = defineComponent({
  name: 'BackendList',
  emits: ['add', 'edit'],
  template: '<div class="backend-list-stub" />',
})
const ConnectionFormStub = defineComponent({
  name: 'ConnectionForm',
  props: {
    backend: { type: Object, default: undefined },
    saving: { type: Boolean, default: false },
  },
  emits: ['save', 'cancel'],
  template: '<div class="connection-form-stub" />',
})

const existing: BackendConfig = {
  id: 'b1',
  name: 'Existing',
  type: 'sparql-1.1',
  endpoint: 'https://ex.org/sparql',
  authType: 'none',
  createdAt: 0,
  updatedAt: 0,
}

function form(overrides: Partial<BackendFormData>): BackendFormData {
  return {
    name: 'N',
    type: 'sparql-1.1',
    endpoint: 'https://ex.org/sparql',
    authType: 'none',
    allowInsecure: false,
    username: '',
    password: '',
    token: '',
    customHeaders: [{ key: '', value: '' }],
    ...overrides,
  }
}

let api: Record<string, ReturnType<typeof vi.fn>>
let alertSpy: ReturnType<typeof vi.fn>
let wrapper: VueWrapper

beforeEach(() => {
  setActivePinia(createPinia())
  api = {
    create: vi.fn(async (config: object) => ({ ...existing, ...config, id: 'new' })),
    update: vi.fn(async (id: string, updates: object) => ({ ...existing, ...updates, id })),
    setSelected: vi.fn(async () => {}),
  }
  Object.assign(window.electronAPI.backends, api)
  alertSpy = vi.fn()
  vi.stubGlobal('alert', alertSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  wrapper = mount(ConnectionPanel, {
    global: { stubs: { BackendList: BackendListStub, ConnectionForm: ConnectionFormStub } },
  })
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openAdd() {
  wrapper.findComponent(BackendListStub).vm.$emit('add')
  await flushPromises()
}

async function save(data: BackendFormData) {
  wrapper.findComponent(ConnectionFormStub).vm.$emit('save', data)
  await flushPromises()
}

describe('ConnectionPanel', () => {
  it('shows the list by default and the form on add, with no backend', async () => {
    expect(wrapper.find('.backend-list-stub').exists()).toBe(true)
    await openAdd()
    expect(wrapper.find('.backend-list-stub').exists()).toBe(false)
    expect(wrapper.findComponent(ConnectionFormStub).props('backend')).toBeUndefined()
  })

  it('returns to the list on cancel', async () => {
    await openAdd()
    wrapper.findComponent(ConnectionFormStub).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.find('.backend-list-stub').exists()).toBe(true)
  })

  it('passes the backend to edit into the form', async () => {
    wrapper.findComponent(BackendListStub).vm.$emit('edit', existing)
    await flushPromises()
    expect(wrapper.findComponent(ConnectionFormStub).props('backend')).toEqual(existing)
  })

  it('creates a generic backend without credentials and closes the form', async () => {
    await openAdd()
    await save(form({ name: 'Gen', allowInsecure: true }))
    expect(api.create).toHaveBeenCalledWith(
      {
        name: 'Gen',
        type: 'sparql-1.1',
        endpoint: 'https://ex.org/sparql',
        authType: 'none',
        providerConfig: undefined,
        allowInsecure: true,
      },
      undefined
    )
    expect(wrapper.find('.backend-list-stub').exists()).toBe(true)
  })

  it('passes basic credentials when both fields are filled', async () => {
    await openAdd()
    await save(form({ authType: 'basic', username: 'u', password: 'p' }))
    expect(api.create.mock.calls[0][1]).toEqual({
      username: 'u',
      password: 'p',
      token: '',
      headers: {},
    })
  })

  it('omits credentials when basic auth fields are empty (edit without re-entering)', async () => {
    wrapper.findComponent(BackendListStub).vm.$emit('edit', existing)
    await flushPromises()
    await save(form({ authType: 'basic', username: '', password: '' }))
    expect(api.update).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ authType: 'basic' }),
      undefined
    )
  })

  it('passes bearer tokens and filters incomplete custom headers', async () => {
    await openAdd()
    await save(form({ authType: 'bearer', token: 'tok' }))
    expect(api.create.mock.calls[0][1]).toMatchObject({ token: 'tok' })

    await openAdd()
    await save(
      form({
        authType: 'custom',
        customHeaders: [
          { key: 'X-A', value: '1' },
          { key: 'X-B', value: '' },
        ],
      })
    )
    expect(api.create.mock.calls[1][1].headers).toEqual({ 'X-A': '1' })
  })

  it('omits credentials when no custom header is complete', async () => {
    await openAdd()
    await save(form({ authType: 'custom', customHeaders: [{ key: 'X', value: '' }] }))
    expect(api.create.mock.calls[0][1]).toBeUndefined()
  })

  it('builds GraphStudio provider config', async () => {
    await openAdd()
    await save(
      form({
        type: 'graphstudio',
        graphmartUri: 'urn:gm',
        graphmartName: 'GM',
        selectedLayers: ['urn:l1'],
      })
    )
    expect(JSON.parse(api.create.mock.calls[0][0].providerConfig)).toEqual({
      graphmartUri: 'urn:gm',
      graphmartName: 'GM',
      selectedLayers: ['urn:l1'],
    })

    await openAdd()
    await save(form({ type: 'graphstudio', graphmartUri: 'urn:gm', selectedLayers: undefined }))
    expect(JSON.parse(api.create.mock.calls[1][0].providerConfig)).toEqual({
      graphmartUri: 'urn:gm',
      graphmartName: '',
      selectedLayers: ['ALL_LAYERS'],
    })
  })

  it('builds Mobi record and repository provider configs', async () => {
    await openAdd()
    await save(
      form({
        type: 'mobi',
        queryMode: 'record',
        catalogId: 'c',
        recordId: 'r',
        recordTitle: 'R',
        includeImports: true,
      })
    )
    expect(JSON.parse(api.create.mock.calls[0][0].providerConfig)).toEqual({
      queryMode: 'record',
      catalogId: 'c',
      catalogTitle: '',
      recordId: 'r',
      recordTitle: 'R',
      recordType: '',
      branchId: '',
      branchTitle: '',
      includeImports: true,
    })

    await openAdd()
    await save(form({ type: 'mobi', queryMode: 'repository', repositoryId: 'repo' }))
    expect(JSON.parse(api.create.mock.calls[1][0].providerConfig)).toMatchObject({
      queryMode: 'repository',
      repositoryId: 'repo',
      repositoryTitle: '',
    })

    await openAdd()
    await save(form({ type: 'mobi' }))
    expect(api.create.mock.calls[2][0].providerConfig).toBeUndefined()
  })

  it('builds GraphDB provider config', async () => {
    await openAdd()
    await save(form({ type: 'graphdb', graphdbRepositoryId: 'g', graphdbRepositoryTitle: 'G' }))
    expect(JSON.parse(api.create.mock.calls[0][0].providerConfig)).toEqual({
      repositoryId: 'g',
      repositoryTitle: 'G',
    })
  })

  it('alerts and keeps the form open when saving fails', async () => {
    api.create.mockRejectedValueOnce(new Error('Duplicate name'))
    await openAdd()
    await save(form({}))
    expect(alertSpy).toHaveBeenCalledWith('Duplicate name')
    expect(wrapper.findComponent(ConnectionFormStub).exists()).toBe(true)
  })

  it('passes saving=true to the form while a save is in flight, then false', async () => {
    let reject!: (e: Error) => void
    api.create.mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    await openAdd()
    const formStub = () => wrapper.findComponent(ConnectionFormStub)
    expect(formStub().props('saving')).toBe(false)
    formStub().vm.$emit('save', form({}))
    await flushPromises()
    expect(formStub().props('saving')).toBe(true)
    reject(new Error('nope'))
    await flushPromises()
    expect(formStub().props('saving')).toBe(false)
  })

  it('re-enables the real ConnectionForm submit button after a failed save', async () => {
    wrapper.unmount()
    api.create.mockRejectedValueOnce(new Error('Duplicate name'))
    wrapper = mount(ConnectionPanel, { global: { stubs: { BackendList: BackendListStub } } })
    wrapper.findComponent(BackendListStub).vm.$emit('add')
    await flushPromises()
    await wrapper.find('#name').setValue('Dup')
    await wrapper.find('#endpoint').setValue('https://ex.org/sparql')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(alertSpy).toHaveBeenCalledWith('Duplicate name')
    const submit = wrapper.find('button[type="submit"]')
    expect(submit.exists()).toBe(true)
    expect(submit.text()).toBe('Create')
    expect(submit.attributes('disabled')).toBeUndefined()
  })
})
