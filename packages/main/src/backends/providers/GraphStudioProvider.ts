/**
 * Altair Graph Studio provider (stub)
 * TODO: Implement Graph Studio-specific functionality
 */

import { BaseProvider } from './BaseProvider.js';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js';

export class GraphStudioProvider extends BaseProvider {
  readonly type = 'graphstudio' as const;

  async execute(
    _config: BackendConfig,
    _query: string,
    _credentials?: BackendCredentials
  ): Promise<QueryResult> {
    throw new Error('Altair Graph Studio provider not yet implemented');
  }

  async validate(_config: BackendConfig): Promise<ValidationResult> {
    return {
      valid: false,
      error: 'Altair Graph Studio provider not yet implemented',
    };
  }
}
