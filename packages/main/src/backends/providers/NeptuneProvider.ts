/**
 * AWS Neptune provider (stub)
 * TODO: Implement Neptune-specific functionality (AWS SigV4 signing, etc.)
 */

import { BaseProvider } from './BaseProvider.js';
import { BackendConfig, BackendCredentials, ValidationResult, QueryResult } from '../types.js';

export class NeptuneProvider extends BaseProvider {
  readonly type = 'neptune' as const;

  async execute(
    _config: BackendConfig,
    _query: string,
    _credentials?: BackendCredentials
  ): Promise<QueryResult> {
    throw new Error('AWS Neptune provider not yet implemented');
  }

  async validate(_config: BackendConfig, _credentials?: BackendCredentials): Promise<ValidationResult> {
    return {
      valid: false,
      error: 'AWS Neptune provider not yet implemented',
    };
  }
}
