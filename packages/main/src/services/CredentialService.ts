/**
 * Credential encryption and storage service
 * Uses Electron's safeStorage for OS-level encryption
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';
import { BackendConfig, BackendCredentials } from '../backends/types.js';

interface StoreSchema {
  backends: BackendConfig[];
  credentials: Record<string, string>; // backendId -> base64 encrypted buffer
  selectedBackendId: string | null;
  schemaVersion: number;
}

export class CredentialService {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'shiny-config',
      defaults: {
        backends: [],
        credentials: {},
        selectedBackendId: null,
        schemaVersion: 1,
      },
    });
  }

  /**
   * Save credentials for a backend (encrypted)
   */
  async saveCredentials(backendId: string, credentials: BackendCredentials): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('Encryption not available - credentials will be stored in plaintext');
    }

    // Serialize credentials to JSON
    const credentialsJson = JSON.stringify(credentials);

    // Encrypt using OS keychain
    const encrypted = safeStorage.encryptString(credentialsJson);

    // Store as base64 string
    const credentials_map = this.store.get('credentials');
    credentials_map[backendId] = encrypted.toString('base64');
    this.store.set('credentials', credentials_map);
  }

  /**
   * Get credentials for a backend (decrypted)
   */
  async getCredentials(backendId: string): Promise<BackendCredentials | null> {
    const credentials_map = this.store.get('credentials');
    const encryptedBase64 = credentials_map[backendId];

    if (!encryptedBase64) {
      return null;
    }

    try {
      // Convert base64 back to buffer
      const encrypted = Buffer.from(encryptedBase64, 'base64');

      // Decrypt using OS keychain
      const decrypted = safeStorage.decryptString(encrypted);

      // Parse JSON
      return JSON.parse(decrypted) as BackendCredentials;
    } catch (error) {
      console.error(`Failed to decrypt credentials for backend ${backendId}:`, error);
      return null;
    }
  }

  /**
   * Delete credentials for a backend
   */
  async deleteCredentials(backendId: string): Promise<void> {
    const credentials_map = this.store.get('credentials');
    delete credentials_map[backendId];
    this.store.set('credentials', credentials_map);
  }

  /**
   * Save backend configuration (non-sensitive)
   */
  async saveBackendConfig(config: BackendConfig): Promise<void> {
    const backends = this.store.get('backends');
    const existingIndex = backends.findIndex((b) => b.id === config.id);

    if (existingIndex >= 0) {
      // Update existing
      backends[existingIndex] = config;
    } else {
      // Add new
      backends.push(config);
    }

    this.store.set('backends', backends);
  }

  /**
   * Get backend configuration by ID
   */
  async getBackendConfig(id: string): Promise<BackendConfig | null> {
    const backends = this.store.get('backends');
    return backends.find((b) => b.id === id) || null;
  }

  /**
   * Get all backend configurations
   */
  async getAllBackendConfigs(): Promise<BackendConfig[]> {
    return this.store.get('backends');
  }

  /**
   * Delete backend configuration
   */
  async deleteBackendConfig(id: string): Promise<void> {
    const backends = this.store.get('backends');
    const filtered = backends.filter((b) => b.id !== id);
    this.store.set('backends', filtered);

    // Also delete credentials
    await this.deleteCredentials(id);

    // Clear selection if this was the selected backend
    const selectedId = this.store.get('selectedBackendId');
    if (selectedId === id) {
      this.store.set('selectedBackendId', null);
    }
  }

  /**
   * Get selected backend ID
   */
  getSelectedBackendId(): string | null {
    return this.store.get('selectedBackendId');
  }

  /**
   * Set selected backend ID
   */
  setSelectedBackendId(id: string | null): void {
    this.store.set('selectedBackendId', id);
  }

  /**
   * Get schema version (for migrations)
   */
  getSchemaVersion(): number {
    return this.store.get('schemaVersion');
  }

  /**
   * Set schema version
   */
  setSchemaVersion(version: number): void {
    this.store.set('schemaVersion', version);
  }

  /**
   * Check if encryption is available
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }
}
