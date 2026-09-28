import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, computed } from 'vue'
import ConnectionForm from '../sidebar/panels/ConnectionForm.vue'
import type { BackendConfig } from '@/types/backends'
import type { BackendFormData } from '@/composables/useBackendValidation'
import type {
  Graphmart,
  MobiCatalog,
  MobiRecord,
  MobiRepository,
  MobiBranch,
  GraphDBRepository,
} from '@/types/electron'

// ---- Fake API composables ---------------------------------------------------

function makeGraphStudio() {
  const graphmarts = ref<Graphmart[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  return {
    graphmarts,
    isLoading,
    error,
    hasGraphmarts: computed(() => graphmarts.value.length > 0),
    loadGraphmarts: vi.fn(async () => {
      graphmarts.value = GRAPHMARTS
    }),
    refreshGraphmarts: vi.fn(async () => {}),
    getGraphmartDetails: vi.fn(
      async (_e: string, uri: string): Promise<Graphmart | null> =>
        GRAPHMARTS.find((g) => g.uri === uri) ?? null
    ),
  }
}

function makeMobi() {
  const catalogs = ref<MobiCatalog[]>([])
  const repositories = ref<MobiRepository[]>([])
  const records = ref<MobiRecord[]>([])
  const branches = ref<MobiBranch[]>([])
  const flag = () => ref(false)
  return {
    catalogs,
    repositories,
    records,
    branches,
    isLoadingCatalogs: flag(),
    isLoadingRepositories: flag(),
    isLoadingRecords: flag(),
    isLoadingBranches: flag(),
    error: ref<string | null>(null),
    hasCatalogs: computed(() => catalogs.value.length > 0),
    hasRepositories: computed(() => repositories.value.length > 0),
    hasRecords: computed(() => records.value.length > 0),
    hasBranches: computed(() => branches.value.length > 0),
    loadCatalogs: vi.fn(async () => {
      catalogs.value = [{ id: 'cat1', iri: 'urn:cat1', title: 'Local Catalog' }]
    }),
    loadRepositories: vi.fn(async () => {
      repositories.value = [{ id: 'repo1', iri: 'urn:repo1', title: 'System Repo' }]
    }),
    loadRecords: vi.fn(async () => {
      records.value = [{ id: 'rec1', iri: 'urn:rec1', title: 'My Ontology', type: 'urn:ont' }]
    }),
    loadBranches: vi.fn(async () => {
      branches.value = [{ id: 'br1', iri: 'urn:br1', title: 'MASTER' }]
    }),
    clearCache: vi.fn(),
  }
}

function makeGraphDB() {
  const repositories = ref<GraphDBRepository[]>([])
  return {
    repositories,
    isLoadingRepositories: ref(false),
    error: ref<string | null>(null),
    hasRepositories: computed(() => repositories.value.length > 0),
    loadRepositories: vi.fn(async () => {
      repositories.value = [
        {
          id: 'gdb1',
          title: 'Star Wars',
          uri: 'http://g/repositories/gdb1',
          readable: true,
          writable: true,
          type: 'graphdb',
        },
      ]
    }),
    refreshRepositories: vi.fn(async () => {}),
  }
}

const GRAPHMARTS: Graphmart[] = [
  {
    uri: 'urn:gm1',
    name: 'Graphmart One',
    status: 'active',
    layers: [
      { uri: 'urn:l1', name: 'Layer 1', enabled: true },
      { uri: 'urn:l2', name: 'Layer 2', enabled: false },
    ],
  },
  { uri: 'urn:gm2', name: 'Graphmart Two', status: 'error', layers: [] },
]

let gs: ReturnType<typeof makeGraphStudio>
let mobi: ReturnType<typeof makeMobi>
let gdb: ReturnType<typeof makeGraphDB>

vi.mock('@/composables/useGraphStudioAPI', () => ({ useGraphStudioAPI: () => gs }))
vi.mock('@/composables/useMobiAPI', () => ({ useMobiAPI: () => mobi }))
vi.mock('@/composables/useGraphDBAPI', () => ({ useGraphDBAPI: () => gdb }))

// ---- Helpers ----------------------------------------------------------------

let getCredentials: ReturnType<typeof vi.fn>
let wrapper: VueWrapper | null = null

function mountForm(backend?: BackendConfig, saving?: boolean) {
  wrapper = mount(ConnectionForm, {
    props: { ...(backend ? { backend } : {}), ...(saving !== undefined ? { saving } : {}) },
  })
  return wrapper
}

function lastSave(w: VueWrapper): BackendFormData {
  const events = w.emitted('save') as BackendFormData[][]
  return events[events.length - 1][0]
}

async function fillBasics(w: VueWrapper, name = 'My EP', endpoint = 'https://ex.org/sparql') {
  await w.find('#name').setValue(name)
  await w.find('#endpoint').setValue(endpoint)
}

function buttonByText(w: VueWrapper, text: string) {
  const btn = w.findAll('button').find((b) => b.text().includes(text))
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}

function backend(overrides: Partial<BackendConfig>): BackendConfig {
  return {
    id: 'b1',
    name: 'Existing',
    type: 'sparql-1.1',
    endpoint: 'https://ex.org/sparql',
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  gs = makeGraphStudio()
  mobi = makeMobi()
  gdb = makeGraphDB()
  getCredentials = vi.fn().mockResolvedValue(null)
  ;(window.electronAPI.backends as unknown as Record<string, unknown>).getCredentials =
    getCredentials
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

// ---- Tests ------------------------------------------------------------------

describe('ConnectionForm - create mode basics', () => {
  it('renders the Add heading and Create button', () => {
    const w = mountForm()
    expect(w.find('h2').text()).toBe('Add Backend')
    expect(w.find('button[type="submit"]').text()).toBe('Create')
    expect(getCredentials).not.toHaveBeenCalled()
  })

  it('emits cancel from both the header X and the Cancel button', async () => {
    const w = mountForm()
    await w.find('.form-header .btn-text').trigger('click')
    await buttonByText(w, 'Cancel').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(2)
  })

  it('shows validation errors and does not emit save for an empty form', async () => {
    const w = mountForm()
    await w.find('form').trigger('submit')
    expect(w.emitted('save')).toBeUndefined()
    const messages = w.findAll('.error-message').map((e) => e.text())
    expect(messages).toContain('Name is required')
    expect(messages).toContain('Endpoint URL is required')
    expect(w.find('#name').classes()).toContain('error')
  })

  it('rejects non-http(s) and malformed endpoints', async () => {
    const w = mountForm()
    await fillBasics(w, 'X', 'ftp://ex.org')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Endpoint must use HTTP or HTTPS protocol')
    await w.find('#endpoint').setValue('not a url')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Invalid URL format')
  })

  it('emits a generic SPARQL save payload and leaves the button enabled', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    const data = lastSave(w)
    expect(data).toMatchObject({
      name: 'My EP',
      type: 'sparql-1.1',
      endpoint: 'https://ex.org/sparql',
      authType: 'none',
      allowInsecure: true,
    })
    const submit = w.find('button[type="submit"]')
    expect(submit.text()).toBe('Create')
    expect(submit.attributes('disabled')).toBeUndefined()
  })

  it('shows a disabled Saving... button only while the saving prop is true', async () => {
    const w = mountForm(undefined, true)
    const submit = () => w.find('button[type="submit"]')
    expect(submit().text()).toBe('Saving...')
    expect(submit().attributes('disabled')).toBeDefined()
    await w.setProps({ saving: false })
    expect(submit().text()).toBe('Create')
    expect(submit().attributes('disabled')).toBeUndefined()
  })

  it('shows Update (not Saving...) in edit mode when saving is false', async () => {
    const w = mountForm(backend({}), false)
    await flushPromises()
    expect(w.find('button[type="submit"]').text()).toBe('Update')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})

describe('ConnectionForm - authentication', () => {
  it('shows no credential fields for none', () => {
    const w = mountForm()
    expect(w.find('#username').exists()).toBe(false)
    expect(w.find('#token').exists()).toBe(false)
    expect(w.find('.custom-headers').exists()).toBe(false)
  })

  it('basic auth shows username/password, validates them, and includes them in payload', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('#authType').setValue('basic')
    expect(w.find('#username').exists()).toBe(true)
    expect(w.find('#password').attributes('type')).toBe('password')

    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Username is required for Basic Auth')
    expect(w.text()).toContain('Password is required for Basic Auth')

    await w.find('#username').setValue('admin')
    await w.find('#password').setValue('secret')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({ authType: 'basic', username: 'admin', password: 'secret' })
  })

  it('bearer auth shows a token field and validates it', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('#authType').setValue('bearer')
    expect(w.find('#username').exists()).toBe(false)
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Token is required for Bearer authentication')
    await w.find('#token').setValue('abc.def')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({ authType: 'bearer', token: 'abc.def' })
  })

  it('custom headers can be added, removed, validated and saved', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('#authType').setValue('custom')
    expect(w.findAll('.header-row')).toHaveLength(1)

    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Header key cannot be empty')

    await w.find('.header-key').setValue('X-Api-Key')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Header value cannot be empty')

    await buttonByText(w, '+ Add Header').trigger('click')
    expect(w.findAll('.header-row')).toHaveLength(2)
    await w.findAll('.header-row')[1].find('button').trigger('click')
    expect(w.findAll('.header-row')).toHaveLength(1)

    await w.find('.header-value').setValue('k123')
    await w.find('form').trigger('submit')
    expect(lastSave(w).customHeaders).toEqual([{ key: 'X-Api-Key', value: 'k123' }])
  })

  it('requires at least one custom header', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('#authType').setValue('custom')
    await w.find('.header-row button').trigger('click')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('At least one header is required')
  })

  it('clears credentials and errors when switching auth type', async () => {
    const w = mountForm()
    await fillBasics(w)
    await w.find('#authType').setValue('basic')
    await w.find('#username').setValue('admin')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Password is required')

    await w.find('#authType').setValue('bearer')
    expect(w.find('.error-message').exists()).toBe(false)
    await w.find('#authType').setValue('basic')
    expect((w.find('#username').element as HTMLInputElement).value).toBe('')
  })
})

describe('ConnectionForm - GraphStudio', () => {
  async function toGraphStudio(w: VueWrapper) {
    await fillBasics(w)
    await w.find('#type').setValue('graphstudio')
  }

  it('requires an endpoint (and basic credentials) before loading graphmarts', async () => {
    const w = mountForm()
    await w.find('#type').setValue('graphstudio')
    const load = buttonByText(w, 'Load Graphmarts')
    expect(load.attributes('disabled')).toBeDefined()

    await w.find('#endpoint').setValue('https://gs.example')
    await w.find('#authType').setValue('basic')
    expect(buttonByText(w, 'Load Graphmarts').attributes('disabled')).toBeDefined()
    await w.find('#username').setValue('u')
    await w.find('#password').setValue('p')
    expect(buttonByText(w, 'Load Graphmarts').attributes('disabled')).toBeUndefined()

    await buttonByText(w, 'Load Graphmarts').trigger('click')
    expect(gs.loadGraphmarts).toHaveBeenCalledWith(
      'https://gs.example',
      { username: 'u', password: 'p' },
      false,
      false
    )
  })

  it('requires a graphmart on submit', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a graphmart')
  })

  it('loads graphmarts, selects one, shows layers and saves a layer subset', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()

    const options = w.findAll('.graphmart-dropdown option')
    expect(options.map((o) => o.text())).toEqual([
      'Select a graphmart...',
      '● Graphmart One',
      '⚠ Graphmart Two',
    ])

    await w.find('.graphmart-dropdown').setValue('urn:gm1')
    await flushPromises()
    expect(gs.getGraphmartDetails).toHaveBeenCalledWith(
      'https://ex.org/sparql',
      'urn:gm1',
      undefined,
      false
    )
    expect(w.text()).toContain('All Layers (default)')

    // Default save uses ALL_LAYERS
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      type: 'graphstudio',
      graphmartUri: 'urn:gm1',
      graphmartName: 'Graphmart One',
      selectedLayers: ['ALL_LAYERS'],
    })

    // Untick "All Layers" and pick a layer
    await w.find('.layer-selection input[type="checkbox"]').setValue(false)
    const layerBoxes = w.findAll('.layer-list input[type="checkbox"]')
    expect(layerBoxes).toHaveLength(2)
    expect(w.find('.layer-list').text()).toContain('● Layer 1')
    expect(w.find('.layer-list').text()).toContain('○ Layer 2')
    await layerBoxes[1].setValue(true)
    await w.find('form').trigger('submit')
    expect(lastSave(w).selectedLayers).toEqual(['urn:l2'])

    // Re-tick "All Layers"
    await w.find('.layer-selection input[type="checkbox"]').setValue(true)
    await w.find('form').trigger('submit')
    expect(lastSave(w).selectedLayers).toEqual(['ALL_LAYERS'])
  })

  it('shows a hint when the graphmart has no layers', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()
    await w.find('.graphmart-dropdown').setValue('urn:gm2')
    await flushPromises()
    await w.find('.layer-selection input[type="checkbox"]').setValue(false)
    expect(w.text()).toContain('No layers available for this graphmart')
  })

  it('shows an error if graphmart details fail to load', async () => {
    gs.getGraphmartDetails.mockRejectedValueOnce(new Error('boom'))
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()
    await w.find('.graphmart-dropdown').setValue('urn:gm1')
    await flushPromises()
    expect(w.find('.layer-selection .error-message').text()).toBe('boom')
  })

  it('refreshes graphmarts and layers', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()
    await w.find('button[title="Refresh graphmart list"]').trigger('click')
    expect(gs.refreshGraphmarts).toHaveBeenCalledWith('https://ex.org/sparql', undefined, false)

    await w.find('.graphmart-dropdown').setValue('urn:gm1')
    await flushPromises()
    await w.find('button[title="Refresh layers"]').trigger('click')
    await flushPromises()
    expect(gs.getGraphmartDetails).toHaveBeenLastCalledWith(
      'https://ex.org/sparql',
      'urn:gm1',
      undefined,
      false,
      true
    )

    gs.getGraphmartDetails.mockRejectedValueOnce(new Error('refresh failed'))
    await w.find('button[title="Refresh layers"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('refresh failed')
  })

  it('clears the graphmart name when the placeholder is re-selected', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()
    await w.find('.graphmart-dropdown').setValue('urn:gm1')
    await flushPromises()
    await w.find('.graphmart-dropdown').setValue('')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a graphmart')
  })

  it('shows the API error message', async () => {
    gs.error.value = 'Unauthorized'
    const w = mountForm()
    await toGraphStudio(w)
    expect(w.text()).toContain('Unauthorized')
  })

  it('clears graphmart fields when switching to another type', async () => {
    const w = mountForm()
    await toGraphStudio(w)
    await buttonByText(w, 'Load Graphmarts').trigger('click')
    await flushPromises()
    await w.find('.graphmart-dropdown').setValue('urn:gm1')
    await flushPromises()
    await w.find('#type').setValue('sparql-1.1')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({ graphmartUri: '', graphmartName: '', selectedLayers: [] })
  })
})

describe('ConnectionForm - Mobi', () => {
  async function toMobi(w: VueWrapper) {
    await fillBasics(w, 'Mobi', 'https://mobi.example')
    await w.find('#type').setValue('mobi')
  }

  it('defaults to record mode and requires catalog and record', async () => {
    const w = mountForm()
    await toMobi(w)
    expect(w.text()).toContain('Load Catalogs')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a catalog')
    expect(w.emitted('save')).toBeUndefined()
  })

  it('walks catalog -> record type filter -> record -> branch and saves the record payload', async () => {
    const w = mountForm()
    await toMobi(w)
    await buttonByText(w, 'Load Catalogs').trigger('click')
    await flushPromises()
    expect(mobi.loadCatalogs).toHaveBeenCalledWith('https://mobi.example', undefined, false, false)

    await w.find('.mobi-dropdown').setValue('cat1')
    expect(w.text()).toContain('Record Type Filter')
    const typeBoxes = w.findAll('.record-type-selection input')
    expect(typeBoxes).toHaveLength(4)
    await typeBoxes[0].setValue(true)

    await buttonByText(w, 'Load Records').trigger('click')
    await flushPromises()
    expect(mobi.loadRecords).toHaveBeenCalledWith(
      'https://mobi.example',
      'cat1',
      ['http://mobi.com/ontologies/ontology-editor#OntologyRecord'],
      undefined,
      false,
      false
    )
    await w.find('button[title="Refresh record list"]').trigger('click')
    expect(mobi.loadRecords).toHaveBeenLastCalledWith(
      'https://mobi.example',
      'cat1',
      ['http://mobi.com/ontologies/ontology-editor#OntologyRecord'],
      undefined,
      true,
      false
    )

    await w.findAll('.mobi-dropdown')[1].setValue('rec1')
    await buttonByText(w, 'Load Branches').trigger('click')
    await flushPromises()
    await w.find('button[title="Refresh branch list"]').trigger('click')
    expect(mobi.loadBranches).toHaveBeenLastCalledWith(
      'https://mobi.example',
      'cat1',
      'rec1',
      undefined,
      true,
      false
    )
    await w.findAll('.mobi-dropdown')[2].setValue('br1')
    await w
      .findAll('.checkbox-label')
      .find((l) => l.text().includes('Include imports'))!
      .find('input')
      .setValue(true)

    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      type: 'mobi',
      queryMode: 'record',
      catalogId: 'cat1',
      catalogTitle: 'Local Catalog',
      recordId: 'rec1',
      recordTitle: 'My Ontology',
      recordType: 'urn:ont',
      branchId: 'br1',
      includeImports: true,
    })
  })

  it('clears the selected record when the record type filter changes', async () => {
    const w = mountForm()
    await toMobi(w)
    await buttonByText(w, 'Load Catalogs').trigger('click')
    await flushPromises()
    await w.find('.mobi-dropdown').setValue('cat1')
    await buttonByText(w, 'Load Records').trigger('click')
    await flushPromises()
    await w.findAll('.mobi-dropdown')[1].setValue('rec1')
    await w.findAll('.record-type-selection input')[1].setValue(true)
    expect(mobi.records.value).toEqual([])
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a record')
  })

  it('refreshing catalogs clears the cache and forces reload', async () => {
    const w = mountForm()
    await toMobi(w)
    await buttonByText(w, 'Load Catalogs').trigger('click')
    await flushPromises()
    await w.find('button[title="Refresh catalog list"]').trigger('click')
    expect(mobi.clearCache).toHaveBeenCalled()
    expect(mobi.loadCatalogs).toHaveBeenLastCalledWith(
      'https://mobi.example',
      undefined,
      true,
      false
    )
  })

  it('repository mode loads repositories and saves a repository payload', async () => {
    const w = mountForm()
    await toMobi(w)
    await w.find('input[type="radio"][value="repository"]').setValue(true)
    expect(w.text()).toContain('Load Repositories')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a repository')

    await buttonByText(w, 'Load Repositories').trigger('click')
    await flushPromises()
    await w.find('button[title="Refresh repository list"]').trigger('click')
    expect(mobi.loadRepositories).toHaveBeenLastCalledWith(
      'https://mobi.example',
      undefined,
      true,
      false
    )
    await w.find('.mobi-dropdown').setValue('repo1')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      type: 'mobi',
      queryMode: 'repository',
      repositoryId: 'repo1',
      repositoryTitle: 'System Repo',
      catalogId: '',
      recordId: '',
    })

    // switching back to record mode clears the repository
    await w.find('input[type="radio"][value="record"]').setValue(true)
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a catalog')
  })

  it('shows mobi API errors', async () => {
    mobi.error.value = 'Mobi down'
    const w = mountForm()
    await toMobi(w)
    expect(w.text()).toContain('Mobi down')
  })
})

describe('ConnectionForm - GraphDB', () => {
  it('loads repositories, requires a selection, and saves the payload', async () => {
    const w = mountForm()
    await fillBasics(w, 'GDB', 'http://localhost:7200')
    await w.find('#type').setValue('graphdb')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a repository')

    await buttonByText(w, 'Load Repositories').trigger('click')
    await flushPromises()
    expect(gdb.loadRepositories).toHaveBeenCalledWith(
      'http://localhost:7200',
      undefined,
      false,
      false
    )
    await w.find('button[title="Refresh repository list"]').trigger('click')
    expect(gdb.refreshRepositories).toHaveBeenCalled()

    await w.find('.graphdb-dropdown').setValue('gdb1')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      type: 'graphdb',
      graphdbRepositoryId: 'gdb1',
      graphdbRepositoryTitle: 'Star Wars',
    })

    await w.find('.graphdb-dropdown').setValue('')
    await w.find('form').trigger('submit')
    expect(w.text()).toContain('Please select a repository')
  })

  it('shows GraphDB API errors', async () => {
    gdb.error.value = 'GraphDB unreachable'
    const w = mountForm()
    await w.find('#type').setValue('graphdb')
    expect(w.text()).toContain('GraphDB unreachable')
  })
})

describe('ConnectionForm - edit mode', () => {
  it('prefills fields, loads stored credentials and shows Update', async () => {
    getCredentials.mockResolvedValue({ username: 'bob', password: 'pw' })
    const w = mountForm(backend({ authType: 'basic', allowInsecure: true }))
    await flushPromises()
    expect(w.find('h2').text()).toBe('Edit Backend')
    expect(w.find('button[type="submit"]').text()).toBe('Update')
    expect((w.find('#name').element as HTMLInputElement).value).toBe('Existing')
    expect(getCredentials).toHaveBeenCalledWith('b1')
    expect((w.find('#username').element as HTMLInputElement).value).toBe('bob')

    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      name: 'Existing',
      authType: 'basic',
      username: 'bob',
      password: 'pw',
      allowInsecure: true,
    })
  })

  it('loads bearer tokens and custom headers from stored credentials', async () => {
    getCredentials.mockResolvedValue({ token: 'tok' })
    const w1 = mountForm(backend({ authType: 'bearer' }))
    await flushPromises()
    expect((w1.find('#token').element as HTMLTextAreaElement).value).toBe('tok')
    w1.unmount()

    getCredentials.mockResolvedValue({ headers: { 'X-A': '1', 'X-B': '2' } })
    const w2 = mountForm(backend({ authType: 'custom' }))
    await flushPromises()
    expect(w2.findAll('.header-row')).toHaveLength(2)
    expect((w2.findAll('.header-key')[1].element as HTMLInputElement).value).toBe('X-B')
  })

  it('survives a credential load failure', async () => {
    getCredentials.mockRejectedValue(new Error('nope'))
    const w = mountForm(backend({}))
    await flushPromises()
    expect(w.find('h2').text()).toBe('Edit Backend')
  })

  it('restores a GraphStudio graphmart and specific layer selection', async () => {
    const w = mountForm(
      backend({
        type: 'graphstudio',
        providerConfig: JSON.stringify({
          graphmartUri: 'urn:gm1',
          graphmartName: 'Graphmart One',
          selectedLayers: ['urn:l1'],
        }),
      })
    )
    await flushPromises()
    expect(gs.loadGraphmarts).toHaveBeenCalled()
    expect(gs.getGraphmartDetails).toHaveBeenCalled()
    const boxes = w.findAll('.layer-list input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((boxes[1].element as HTMLInputElement).checked).toBe(false)
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({ graphmartUri: 'urn:gm1', selectedLayers: ['urn:l1'] })
  })

  it('restores a GraphStudio backend using all layers and handles detail errors', async () => {
    gs.getGraphmartDetails.mockRejectedValueOnce(new Error('details failed'))
    const w = mountForm(
      backend({
        type: 'graphstudio',
        providerConfig: JSON.stringify({ graphmartUri: 'urn:gm1', selectedLayers: [] }),
      })
    )
    await flushPromises()
    expect(w.text()).toContain('details failed')
  })

  it('tolerates malformed provider config', async () => {
    const w = mountForm(backend({ type: 'graphstudio', providerConfig: '{bad json' }))
    await flushPromises()
    expect(console.error).toHaveBeenCalledWith(
      'Failed to parse provider config:',
      expect.anything()
    )
    expect(w.find('h2').text()).toBe('Edit Backend')
  })

  it('restores a Mobi record-mode selection by loading catalog, records and branches', async () => {
    const w = mountForm(
      backend({
        type: 'mobi',
        providerConfig: JSON.stringify({
          queryMode: 'record',
          catalogId: 'cat1',
          catalogTitle: 'Local Catalog',
          recordId: 'rec1',
          recordTitle: 'My Ontology',
          branchId: 'br1',
          includeImports: true,
        }),
      })
    )
    await flushPromises()
    expect(mobi.loadCatalogs).toHaveBeenCalled()
    expect(mobi.loadRecords).toHaveBeenCalledWith(
      'https://ex.org/sparql',
      'cat1',
      undefined,
      undefined,
      false,
      false
    )
    expect(mobi.loadBranches).toHaveBeenCalled()
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      queryMode: 'record',
      catalogId: 'cat1',
      recordId: 'rec1',
      branchId: 'br1',
      includeImports: true,
    })
  })

  it('restores a Mobi repository-mode selection', async () => {
    const w = mountForm(
      backend({
        type: 'mobi',
        providerConfig: JSON.stringify({
          queryMode: 'repository',
          repositoryId: 'repo1',
          repositoryTitle: 'System Repo',
        }),
      })
    )
    await flushPromises()
    expect(mobi.loadRepositories).toHaveBeenCalled()
    expect(
      (w.find('input[type="radio"][value="repository"]').element as HTMLInputElement).checked
    ).toBe(true)
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({ queryMode: 'repository', repositoryId: 'repo1' })
  })

  it('restores a GraphDB repository selection', async () => {
    const w = mountForm(
      backend({
        type: 'graphdb',
        providerConfig: JSON.stringify({ repositoryId: 'gdb1', repositoryTitle: 'Star Wars' }),
      })
    )
    await flushPromises()
    expect(gdb.loadRepositories).toHaveBeenCalled()
    expect((w.find('.graphdb-dropdown').element as HTMLSelectElement).value).toBe('gdb1')
    await w.find('form').trigger('submit')
    expect(lastSave(w)).toMatchObject({
      graphdbRepositoryId: 'gdb1',
      graphdbRepositoryTitle: 'Star Wars',
    })
  })

  it('tolerates malformed Mobi and GraphDB provider configs', async () => {
    mountForm(backend({ type: 'mobi', providerConfig: 'x' })).unmount()
    mountForm(backend({ type: 'graphdb', providerConfig: 'x' }))
    await flushPromises()
    expect(console.error).toHaveBeenCalledWith(
      'Failed to parse Mobi provider config:',
      expect.anything()
    )
    expect(console.error).toHaveBeenCalledWith(
      'Failed to parse GraphDB provider config:',
      expect.anything()
    )
  })
})
