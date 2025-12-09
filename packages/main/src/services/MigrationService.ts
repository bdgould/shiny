import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { BackendConfig } from '../backends/types'

interface MigrationSchema {
  schemaVersion?: number
  backends?: BackendConfig[]
}

/**
 * Handles data migrations for app upgrades
 */
export class MigrationService {
  private store: Store<MigrationSchema>
  private currentSchemaVersion = 1

  constructor() {
    this.store = new Store<MigrationSchema>({
      name: 'backends',
    })
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    const currentVersion = this.store.get('schemaVersion', 0)

    if (currentVersion < this.currentSchemaVersion) {
      console.log(
        `Running migrations from version ${currentVersion} to ${this.currentSchemaVersion}`
      )

      if (currentVersion < 1) {
        await this.migrateToV1()
      }

      // Mark migration complete
      this.store.set('schemaVersion', this.currentSchemaVersion)
      console.log('Migrations complete')
    }
  }

  /**
   * Migrate to schema version 1: Create default backend if none exist
   */
  private async migrateToV1(): Promise<void> {
    console.log('Running migration to schema v1: Creating default backend')

    const backends = this.store.get('backends', [])

    // Only create default backend if none exist
    if (backends.length === 0) {
      const defaultBackend: BackendConfig = {
        id: randomUUID(),
        name: 'DBpedia',
        type: 'sparql-1.1',
        endpoint: 'https://dbpedia.org/sparql',
        authType: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      this.store.set('backends', [defaultBackend])
      this.store.set('selectedBackendId', defaultBackend.id)

      console.log('Created default DBpedia backend')
    } else {
      console.log('Backends already exist, skipping default backend creation')
    }
  }
}

// Export singleton instance
let migrationServiceInstance: MigrationService | null = null

export function getMigrationService(): MigrationService {
  if (!migrationServiceInstance) {
    migrationServiceInstance = new MigrationService()
  }
  return migrationServiceInstance
}
