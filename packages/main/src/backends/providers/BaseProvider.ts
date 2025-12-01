/**
 * Base provider abstract class
 * All backend providers must extend this class
 */

import { BackendConfig, BackendCredentials, ValidationResult, QueryResult, BackendType } from '../types.js';

export abstract class BaseProvider {
  abstract readonly type: BackendType;

  /**
   * Execute a SPARQL query against the backend
   */
  abstract execute(
    config: BackendConfig,
    query: string,
    credentials?: BackendCredentials
  ): Promise<QueryResult>;

  /**
   * Validate backend configuration (test connection)
   */
  abstract validate(config: BackendConfig): Promise<ValidationResult>;

  /**
   * Get authentication headers based on auth type and credentials
   */
  protected getAuthHeaders(
    config: BackendConfig,
    credentials?: BackendCredentials
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (!credentials || config.authType === 'none') {
      return headers;
    }

    switch (config.authType) {
      case 'basic':
        if (credentials.username && credentials.password) {
          const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;

      case 'bearer':
        if (credentials.token) {
          headers['Authorization'] = `Bearer ${credentials.token}`;
        }
        break;

      case 'custom':
        if (credentials.headers) {
          Object.assign(headers, credentials.headers);
        }
        break;
    }

    return headers;
  }

  /**
   * Validate URL format
   */
  protected validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
