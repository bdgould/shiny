/**
 * Service initialization
 * Creates singleton instances of services for use across the main process
 */

import { CredentialService } from './CredentialService.js'
import { BackendService } from './BackendService.js'
import { OntologyCacheService } from './OntologyCacheService.js'

// Singleton instances
let credentialService: CredentialService | null = null
let backendService: BackendService | null = null
let ontologyCacheService: OntologyCacheService | null = null

/**
 * Initialize all services
 * Should be called once on app startup
 */
export function initializeServices(): void {
  console.log('Initializing services...')

  // Create credential service
  credentialService = new CredentialService()
  console.log(`Encryption available: ${credentialService.isEncryptionAvailable()}`)

  // Create backend service
  backendService = new BackendService(credentialService)

  // Create ontology cache service
  ontologyCacheService = new OntologyCacheService(backendService)

  console.log('Services initialized successfully')
}

/**
 * Get credential service instance
 */
export function getCredentialService(): CredentialService {
  if (!credentialService) {
    throw new Error('Services not initialized. Call initializeServices() first.')
  }
  return credentialService
}

/**
 * Get backend service instance
 */
export function getBackendService(): BackendService {
  if (!backendService) {
    throw new Error('Services not initialized. Call initializeServices() first.')
  }
  return backendService
}

/**
 * Get ontology cache service instance
 */
export function getOntologyCacheService(): OntologyCacheService {
  if (!ontologyCacheService) {
    throw new Error('Services not initialized. Call initializeServices() first.')
  }
  return ontologyCacheService
}
