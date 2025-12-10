/**
 * Backend provider factory
 * Registry pattern for looking up providers by type
 */

import { BackendType } from './types.js'
import { BaseProvider } from './providers/BaseProvider.js'
import { Sparql11Provider } from './providers/Sparql11Provider.js'
import { GraphStudioProvider } from './providers/GraphStudioProvider.js'
import { MobiProvider } from './providers/MobiProvider.js'
import { NeptuneProvider } from './providers/NeptuneProvider.js'
import { StardogProvider } from './providers/StardogProvider.js'

/**
 * Provider registry
 * Maps backend type to provider instance
 */
const providers: Map<BackendType, BaseProvider> = new Map()

/**
 * Initialize providers
 */
function initializeProviders(): void {
  if (providers.size > 0) {
    return // Already initialized
  }

  // Register all providers
  providers.set('sparql-1.1', new Sparql11Provider())
  providers.set('graphstudio', new GraphStudioProvider())
  providers.set('mobi', new MobiProvider())
  providers.set('neptune', new NeptuneProvider())
  providers.set('stardog', new StardogProvider())
}

// Initialize on module load
initializeProviders()

/**
 * Backend Factory
 */
export class BackendFactory {
  /**
   * Get provider for backend type
   */
  static getProvider(type: BackendType): BaseProvider {
    const provider = providers.get(type)

    if (!provider) {
      throw new Error(`Unknown backend type: ${type}`)
    }

    return provider
  }

  /**
   * Get all registered provider types
   */
  static getAvailableTypes(): BackendType[] {
    return Array.from(providers.keys())
  }

  /**
   * Check if backend type is supported
   */
  static isSupported(type: string): type is BackendType {
    return providers.has(type as BackendType)
  }
}
