# Testing Guide for Shiny

This document provides comprehensive guidance on writing and running tests for the Shiny SPARQL client.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Testing Patterns](#testing-patterns)
- [Coverage Requirements](#coverage-requirements)
- [Continuous Integration](#continuous-integration)

---

## Overview

Shiny uses **Vitest** as the testing framework across all packages in the monorepo. The test suite is organized by package:

- **`packages/main`**: Main Electron process tests (Node.js environment)
- **`packages/preload`**: Preload script tests (Node.js environment)
- **`packages/renderer`**: Vue 3 UI tests (Browser environment with happy-dom)

### Why Vitest?

- **Fast**: Native ESM support, instant hot module reload
- **Vue 3 Compatible**: First-class support for Vue components
- **Modern**: TypeScript support out of the box
- **Familiar API**: Jest-compatible API for easy learning
- **Monorepo-Friendly**: Workspace configuration for multi-package projects

---

## Running Tests

### Run All Tests (Watch Mode)

```bash
npm test
```

Runs all tests in watch mode. Tests automatically re-run when files change.

### Run All Tests Once (CI Mode)

```bash
npm run test:run
```

Runs all tests once and exits. Used in CI/CD pipelines.

### Run Tests with UI

```bash
npm run test:ui
```

Opens Vitest UI in your browser for visual test debugging and exploration.

### Run Tests with Coverage

```bash
npm run test:coverage
```

Generates a coverage report showing which lines of code are tested.

Coverage reports are generated in:
- `packages/main/coverage/`
- `packages/renderer/coverage/`
- `packages/preload/coverage/`

### Run Tests for Specific Package

```bash
# Main process only
npm run test:main

# Renderer only
npm run test:renderer

# Preload only
npm run test:preload
```

### Run Specific Test File

```bash
# Run a single test file in watch mode
npx vitest packages/renderer/src/utils/__tests__/serializeResults.test.ts

# Run once
npx vitest run packages/renderer/src/utils/__tests__/serializeResults.test.ts
```

### Run Tests Matching a Pattern

```bash
# Run all tests with "serialize" in the name
npx vitest --run --testNamePattern=serialize

# Run all test files in utils directory
npx vitest --run packages/renderer/src/utils
```

---

## Writing Tests

### Test File Naming

Test files should be placed in `__tests__` directories or use `.test.ts` / `.spec.ts` suffixes:

#### Recommended Structure (Used in Shiny)

```
src/
├── utils/
│   ├── __tests__/
│   │   └── serializeResults.test.ts
│   └── serializeResults.ts
├── stores/
│   ├── __tests__/
│   │   └── connection.test.ts
│   └── connection.ts
└── components/
    ├── __tests__/
    │   └── AskBadgeView.test.vue.ts
    └── AskBadgeView.vue
```

#### Alternative (Inline Tests)

```
src/
├── utils/
│   ├── serializeResults.ts
│   └── serializeResults.test.ts  # Next to implementation
```

### Test File Template

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('MyFunction', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    // Cleanup after each test
  })

  it('should do something specific', () => {
    // Arrange: Set up test data
    const input = 'test'

    // Act: Execute the function
    const result = myFunction(input)

    // Assert: Verify the result
    expect(result).toBe('expected')
  })
})
```

---

## Testing Patterns

### 1. Utility Function Tests (`packages/renderer/src/utils`)

**Example**: `serializeResults.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { serializeToCSV } from '../serializeResults'

describe('serializeToCSV', () => {
  it('should convert SELECT results to CSV format', () => {
    const results = {
      data: {
        head: { vars: ['name', 'age'] },
        results: {
          bindings: [
            { name: { value: 'Alice' }, age: { value: '30' } },
          ],
        },
      },
    }

    const csv = serializeToCSV(results)

    expect(csv).toBe('name,age\\nAlice,30')
  })

  it('should handle missing values', () => {
    // Test edge cases
  })

  it('should throw error for invalid input', () => {
    expect(() => serializeToCSV({})).toThrow()
  })
})
```

**Key Points**:
- Test happy path and edge cases
- Test error handling
- Use descriptive test names

### 2. Pinia Store Tests (`packages/renderer/src/stores`)

**Example**: `connection.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from '../connection'

describe('useConnectionStore', () => {
  beforeEach(() => {
    // Create fresh Pinia instance before each test
    setActivePinia(createPinia())

    // Mock electron API
    window.electronAPI.backends.getAll = vi.fn().mockResolvedValue([])
  })

  it('should load backends from API', async () => {
    const mockBackends = [{ id: '1', name: 'Backend 1' }]
    window.electronAPI.backends.getAll = vi.fn().mockResolvedValue(mockBackends)

    const store = useConnectionStore()
    await store.loadBackends()

    expect(store.backends).toEqual(mockBackends)
  })

  it('should handle errors gracefully', async () => {
    window.electronAPI.backends.getAll = vi.fn().mockRejectedValue(new Error('API error'))

    const store = useConnectionStore()

    await expect(store.loadBackends()).rejects.toThrow('API error')
    expect(store.error).toBeTruthy()
  })
})
```

**Key Points**:
- Create fresh Pinia instance for each test
- Mock electron API calls
- Test state mutations and computed properties
- Test error handling

### 3. Vue Component Tests (`packages/renderer/src/components`)

**Example**: `AskBadgeView.test.vue.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AskBadgeView from '../AskBadgeView.vue'

describe('AskBadgeView', () => {
  it('should render YES badge when result is true', () => {
    const wrapper = mount(AskBadgeView, {
      props: {
        result: { head: {}, boolean: true },
      },
    })

    expect(wrapper.text()).toContain('YES')
    expect(wrapper.find('.ask-badge').classes()).toContain('success')
  })

  it('should render NO badge when result is false', () => {
    const wrapper = mount(AskBadgeView, {
      props: {
        result: { head: {}, boolean: false },
      },
    })

    expect(wrapper.text()).toContain('NO')
    expect(wrapper.find('.ask-badge').classes()).toContain('error')
  })

  it('should update when prop changes', async () => {
    const wrapper = mount(AskBadgeView, {
      props: {
        result: { head: {}, boolean: true },
      },
    })

    await wrapper.setProps({
      result: { head: {}, boolean: false },
    })

    expect(wrapper.text()).toContain('NO')
  })
})
```

**Key Points**:
- Use `mount()` or `shallowMount()` from `@vue/test-utils`
- Test component rendering
- Test props and reactivity
- Test user interactions (clicks, input)
- Test emitted events

### 4. Main Process Service Tests (`packages/main/src/services`)

**Example**: `CredentialService.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CredentialService } from '../CredentialService'
import { safeStorage } from 'electron'

// Mock electron modules
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str) => Buffer.from(str)),
    decryptString: vi.fn((buf) => buf.toString()),
  },
}))

vi.mock('electron-store')

describe('CredentialService', () => {
  let service: CredentialService

  beforeEach(() => {
    service = new CredentialService()
    vi.clearAllMocks()
  })

  it('should encrypt and save credentials', async () => {
    const credentials = { username: 'test', password: 'pass123' }

    await service.saveCredentials('backend-1', credentials)

    expect(safeStorage.encryptString).toHaveBeenCalled()
  })

  it('should decrypt and retrieve credentials', async () => {
    const credentials = { username: 'test', password: 'pass123' }
    await service.saveCredentials('backend-1', credentials)

    const retrieved = await service.getCredentials('backend-1')

    expect(retrieved).toEqual(credentials)
  })
})
```

**Key Points**:
- Mock Electron APIs (`safeStorage`, `electron-store`, etc.)
- Test encryption/decryption logic
- Test error handling for security-critical code
- Use `vi.mock()` to mock Node modules

### 5. Mocking Patterns

#### Mocking Functions

```typescript
const mockFn = vi.fn()
mockFn.mockReturnValue('value')
mockFn.mockResolvedValue(Promise.resolve('async value'))
mockFn.mockRejectedValue(new Error('error'))

expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenCalledTimes(2)
```

#### Mocking Modules

```typescript
// Mock entire module
vi.mock('../myModule', () => ({
  myFunction: vi.fn(() => 'mocked'),
}))

// Mock specific exports
vi.mock('../myModule', async () => {
  const actual = await vi.importActual('../myModule')
  return {
    ...actual,
    myFunction: vi.fn(),
  }
})
```

#### Mocking Electron API (in renderer tests)

The `packages/renderer/tests/setup.ts` file provides global mocks:

```typescript
// Automatically available in all renderer tests
window.electronAPI.query.execute = vi.fn()
window.electronAPI.backends.list = vi.fn()
// etc.
```

You can override these in specific tests:

```typescript
it('should handle API call', async () => {
  window.electronAPI.query.execute = vi.fn().mockResolvedValue({
    data: { results: [] },
    queryType: 'SELECT',
  })

  // Your test code
})
```

---

## Coverage Requirements

### Current Thresholds

Configured in `vitest.config.ts` for each package:

```typescript
coverage: {
  thresholds: {
    lines: 50,      // 50% of lines must be covered
    functions: 50,  // 50% of functions must be covered
    branches: 50,   // 50% of branches must be covered
    statements: 50, // 50% of statements must be covered
  },
}
```

### Coverage Goals

- **Short-term (Current)**: 50% coverage baseline
- **Medium-term**: 70% coverage on critical paths
- **Long-term**: 80%+ coverage across codebase

### Priority Areas for Testing

1. **High Priority** (Security & Data Integrity):
   - `CredentialService` - Encryption/decryption
   - `serializeResults` - Data export
   - `rdfProcessor` - RDF parsing/serialization
   - Backend providers - SPARQL query execution

2. **Medium Priority** (Business Logic):
   - Pinia stores - State management
   - Composables - Reusable logic
   - IPC handlers - Main/renderer communication

3. **Lower Priority** (UI):
   - Vue components - Visual feedback
   - Icons and styling components

### Viewing Coverage Reports

After running `npm run test:coverage`:

```bash
# Open HTML coverage report
open packages/renderer/coverage/index.html
open packages/main/coverage/index.html
```

---

## Continuous Integration

Tests run automatically in GitHub Actions on every push to `main`.

### CI Workflow

See `.github/workflows/release.yml`:

```yaml
- name: Run linter
  run: npm run lint

- name: Run type check
  run: npm run type-check

# Tests can be added:
- name: Run tests
  run: npm run test:run
```

### Local Pre-Push Checklist

Before pushing code:

```bash
# 1. Run linter
npm run lint

# 2. Run type check
npm run type-check

# 3. Run all tests
npm run test:run

# 4. Check coverage (optional)
npm run test:coverage
```

---

## Best Practices

### 1. Test Behavior, Not Implementation

❌ **Bad**: Testing internal implementation details
```typescript
it('should call internal helper function', () => {
  expect(component._internalHelper).toHaveBeenCalled()
})
```

✅ **Good**: Testing observable behavior
```typescript
it('should display error message when input is invalid', () => {
  wrapper.find('input').setValue('invalid')
  expect(wrapper.text()).toContain('Invalid input')
})
```

### 2. Use Descriptive Test Names

❌ **Bad**:
```typescript
it('works', () => { ... })
it('test 1', () => { ... })
```

✅ **Good**:
```typescript
it('should serialize SELECT results to CSV format', () => { ... })
it('should throw error when credentials are missing', () => { ... })
```

### 3. Follow AAA Pattern

```typescript
it('should do something', () => {
  // Arrange: Set up test data
  const input = 'test input'
  const expected = 'expected output'

  // Act: Execute the function under test
  const result = myFunction(input)

  // Assert: Verify the result
  expect(result).toBe(expected)
})
```

### 4. Keep Tests Independent

Each test should be able to run independently in any order.

❌ **Bad**: Tests depend on each other
```typescript
let sharedState: any

it('test 1', () => {
  sharedState = doSomething() // Affects test 2
})

it('test 2', () => {
  expect(sharedState).toBeDefined() // Depends on test 1
})
```

✅ **Good**: Tests are independent
```typescript
it('test 1', () => {
  const localState = doSomething()
  expect(localState).toBeDefined()
})

it('test 2', () => {
  const localState = doSomething()
  expect(localState).toBeDefined()
})
```

### 5. Test Edge Cases

Don't just test the happy path:

```typescript
describe('serializeToCSV', () => {
  it('should handle normal data', () => { ... })
  it('should handle empty results', () => { ... })
  it('should handle missing values', () => { ... })
  it('should handle special characters', () => { ... })
  it('should throw error for invalid input', () => { ... })
})
```

---

## Troubleshooting

### Tests Won't Run

**Problem**: `Error: Cannot find module 'vitest'`

**Solution**:
```bash
npm install
```

### Mocks Not Working

**Problem**: Mocked functions aren't being called

**Solution**: Check that mocks are set up before importing the module under test:

```typescript
// Correct order
vi.mock('../myModule')
import { myFunction } from '../myModule'

// Wrong order - won't work
import { myFunction } from '../myModule'
vi.mock('../myModule')
```

### Coverage Reports Not Generating

**Problem**: No coverage files created

**Solution**:
```bash
# Install coverage provider
npm install --save-dev @vitest/coverage-v8

# Run with coverage flag
npm run test:coverage
```

### Vue Component Tests Fail

**Problem**: `ReferenceError: window is not defined`

**Solution**: Ensure test uses `happy-dom` environment (configured in `vitest.config.ts`).

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vue Test Utils Documentation](https://test-utils.vuejs.org/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

---

## Questions or Issues?

If you encounter problems with tests or have questions about testing patterns:

1. Check this guide
2. Look at existing test examples in `__tests__` directories
3. Open an issue on GitHub
