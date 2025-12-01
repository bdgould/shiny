/**
 * Stardog provider (stub)
 * TODO: Implement Stardog-specific functionality (JWT auth, etc.)
 */

import { BaseProvider } from './BaseProvider.js';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js';

export class StardogProvider extends BaseProvider {
  readonly type = 'stardog' as const;

  async execute(
    _config: BackendConfig,
    _query: string,
    _credentials?: BackendCredentials
  ): Promise<QueryResult> {
    throw new Error('Stardog provider not yet implemented');
  }

  async validate(_config: BackendConfig): Promise<ValidationResult> {
    return {
      valid: false,
      error: 'Stardog provider not yet implemented',
    };
  }
}
