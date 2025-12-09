/**
 * Backend management service
 * Coordinates CRUD operations for backends and credentials
 */

import { randomUUID } from 'crypto'
import { BackendConfig, BackendCredentials, ValidationResult } from '../backends/types.js'
import { CredentialService } from './CredentialService.js'
import { BackendFactory } from '../backends/BackendFactory.js'

export class BackendService {
  private credentialService: CredentialService

  constructor(credentialService: CredentialService) {
    this.credentialService = credentialService
  }

  /**
   * Get all backend configurations
   */
  async getAllBackends(): Promise<BackendConfig[]> {
    return await this.credentialService.getAllBackendConfigs()
  }

  /**
   * Get a single backend by ID
   */
  async getBackend(id: string): Promise<BackendConfig | null> {
    return await this.credentialService.getBackendConfig(id)
  }

  /**
   * Create a new backend
   */
  async createBackend(
    config: Omit<BackendConfig, 'id' | 'createdAt' | 'updatedAt'>,
    credentials?: BackendCredentials
  ): Promise<BackendConfig> {
    // Validate configuration
    const validation = await this.validateBackendConfig(config)
    if (!validation.valid) {
      throw new Error(`Invalid backend configuration: ${validation.error}`)
    }

    // Create full config with ID and timestamps
    const newConfig: BackendConfig = {
      ...config,
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Save config
    await this.credentialService.saveBackendConfig(newConfig)

    // Save credentials if provided
    if (credentials && this.requiresCredentials(config.authType)) {
      await this.credentialService.saveCredentials(newConfig.id, {
        ...credentials,
        backendId: newConfig.id,
      })
    }

    // Auto-select if this is the first backend
    const allBackends = await this.credentialService.getAllBackendConfigs()
    if (allBackends.length === 1) {
      this.credentialService.setSelectedBackendId(newConfig.id)
    }

    return newConfig
  }

  /**
   * Update an existing backend
   */
  async updateBackend(
    id: string,
    updates: Partial<Omit<BackendConfig, 'id' | 'createdAt'>>,
    credentials?: BackendCredentials
  ): Promise<BackendConfig> {
    // Get existing config
    const existing = await this.credentialService.getBackendConfig(id)
    if (!existing) {
      throw new Error(`Backend not found: ${id}`)
    }

    // Merge updates
    const updated: BackendConfig = {
      ...existing,
      ...updates,
      id: existing.id, // Ensure ID doesn't change
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    }

    // Validate merged config
    const validation = await this.validateBackendConfig(updated)
    if (!validation.valid) {
      throw new Error(`Invalid backend configuration: ${validation.error}`)
    }

    // Save updated config
    await this.credentialService.saveBackendConfig(updated)

    // Handle credentials:
    // - If credentials provided: save/update them
    // - If credentials undefined and auth type requires them: preserve existing credentials
    // - If auth type is 'none': delete credentials
    if (credentials && this.requiresCredentials(updated.authType)) {
      // Update credentials with new values
      await this.credentialService.saveCredentials(id, {
        ...credentials,
        backendId: id,
      })
    } else if (!this.requiresCredentials(updated.authType)) {
      // Delete credentials if auth type changed to 'none'
      await this.credentialService.deleteCredentials(id)
    }
    // If credentials undefined and auth type requires them: do nothing (preserve existing)

    return updated
  }

  /**
   * Delete a backend
   */
  async deleteBackend(id: string): Promise<void> {
    const existing = await this.credentialService.getBackendConfig(id)
    if (!existing) {
      throw new Error(`Backend not found: ${id}`)
    }

    await this.credentialService.deleteBackendConfig(id)
  }

  /**
   * Test connection to a backend
   */
  async testConnection(id: string): Promise<ValidationResult> {
    const config = await this.credentialService.getBackendConfig(id)
    if (!config) {
      return { valid: false, error: 'Backend not found' }
    }

    try {
      // Get credentials if backend requires authentication
      const credentials = await this.credentialService.getCredentials(id)

      const provider = BackendFactory.getProvider(config.type)
      return await provider.validate(config, credentials || undefined)
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Get selected backend ID
   */
  getSelectedBackendId(): string | null {
    return this.credentialService.getSelectedBackendId()
  }

  /**
   * Select a backend
   */
  async selectBackend(id: string | null): Promise<void> {
    if (id !== null) {
      const backend = await this.credentialService.getBackendConfig(id)
      if (!backend) {
        throw new Error(`Backend not found: ${id}`)
      }
    }
    this.credentialService.setSelectedBackendId(id)
  }

  /**
   * Get credentials for a backend (used by query executor)
   */
  async getCredentials(backendId: string): Promise<BackendCredentials | null> {
    return await this.credentialService.getCredentials(backendId)
  }

  /**
   * Validate backend configuration
   */
  private async validateBackendConfig(config: Partial<BackendConfig>): Promise<ValidationResult> {
    // Check required fields
    if (!config.name || config.name.trim().length === 0) {
      return { valid: false, error: 'Backend name is required' }
    }

    if (config.name.length > 50) {
      return { valid: false, error: 'Backend name must be 50 characters or less' }
    }

    if (!config.type) {
      return { valid: false, error: 'Backend type is required' }
    }

    if (!config.endpoint || config.endpoint.trim().length === 0) {
      return { valid: false, error: 'Endpoint URL is required' }
    }

    // Validate URL
    try {
      const url = new URL(config.endpoint)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { valid: false, error: 'Endpoint must use HTTP or HTTPS protocol' }
      }
    } catch {
      return { valid: false, error: 'Invalid endpoint URL' }
    }

    if (!config.authType) {
      return { valid: false, error: 'Authentication type is required' }
    }

    return { valid: true }
  }

  /**
   * Check if auth type requires credentials
   */
  private requiresCredentials(authType: string): boolean {
    return authType !== 'none'
  }
}
