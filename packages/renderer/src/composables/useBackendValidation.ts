/**
 * Backend configuration validation composable
 */

import { ref, computed } from 'vue';
import type { BackendType, AuthType } from '../types/backends';

export interface BackendFormData {
  name: string;
  type: BackendType;
  endpoint: string;
  authType: AuthType;
  allowInsecure?: boolean;

  // Credentials (optional based on auth type)
  username?: string;
  password?: string;
  token?: string;
  customHeaders?: Array<{ key: string; value: string }>;

  // GraphStudio-specific fields
  graphmartUri?: string;
  graphmartName?: string;
  selectedLayers?: string[]; // Array of layer URIs or ['ALL_LAYERS']
}

export interface ValidationErrors {
  name?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  token?: string;
  customHeaders?: string;
  graphmart?: string;
  layers?: string;
}

export function useBackendValidation() {
  const errors = ref<ValidationErrors>({});

  function validateName(name: string): string | undefined {
    if (!name || name.trim().length === 0) {
      return 'Name is required';
    }
    if (name.length > 50) {
      return 'Name must be 50 characters or less';
    }
    return undefined;
  }

  function validateEndpoint(endpoint: string): string | undefined {
    if (!endpoint || endpoint.trim().length === 0) {
      return 'Endpoint URL is required';
    }

    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Endpoint must use HTTP or HTTPS protocol';
      }
    } catch {
      return 'Invalid URL format';
    }

    return undefined;
  }

  function validateBasicAuth(username?: string, password?: string): { username?: string; password?: string } {
    const errors: { username?: string; password?: string } = {};

    if (!username || username.trim().length === 0) {
      errors.username = 'Username is required for Basic Auth';
    }
    if (!password || password.trim().length === 0) {
      errors.password = 'Password is required for Basic Auth';
    }

    return errors;
  }

  function validateBearerToken(token?: string): string | undefined {
    if (!token || token.trim().length === 0) {
      return 'Token is required for Bearer authentication';
    }
    return undefined;
  }

  function validateCustomHeaders(headers?: Array<{ key: string; value: string }>): string | undefined {
    if (!headers || headers.length === 0) {
      return 'At least one header is required for Custom Headers authentication';
    }

    for (const header of headers) {
      if (!header.key || header.key.trim().length === 0) {
        return 'Header key cannot be empty';
      }
      if (!header.value || header.value.trim().length === 0) {
        return 'Header value cannot be empty';
      }
    }

    return undefined;
  }

  function validateGraphStudio(formData: BackendFormData): { graphmart?: string; layers?: string } {
    const errors: { graphmart?: string; layers?: string } = {};

    // GraphStudio requires a graphmart to be selected
    if (!formData.graphmartUri || formData.graphmartUri.trim().length === 0) {
      errors.graphmart = 'Please select a graphmart';
    }

    // Note: selectedLayers is optional - empty or ['ALL_LAYERS'] means query all layers

    return errors;
  }

  function validateForm(formData: BackendFormData): boolean {
    errors.value = {};

    // Validate required fields
    const nameError = validateName(formData.name);
    if (nameError) errors.value.name = nameError;

    const endpointError = validateEndpoint(formData.endpoint);
    if (endpointError) errors.value.endpoint = endpointError;

    // Validate credentials based on auth type
    if (formData.authType === 'basic') {
      const authErrors = validateBasicAuth(formData.username, formData.password);
      if (authErrors.username) errors.value.username = authErrors.username;
      if (authErrors.password) errors.value.password = authErrors.password;
    } else if (formData.authType === 'bearer') {
      const tokenError = validateBearerToken(formData.token);
      if (tokenError) errors.value.token = tokenError;
    } else if (formData.authType === 'custom') {
      const headersError = validateCustomHeaders(formData.customHeaders);
      if (headersError) errors.value.customHeaders = headersError;
    }

    // Validate GraphStudio-specific fields
    if (formData.type === 'graphstudio') {
      const graphstudioErrors = validateGraphStudio(formData);
      if (graphstudioErrors.graphmart) errors.value.graphmart = graphstudioErrors.graphmart;
      if (graphstudioErrors.layers) errors.value.layers = graphstudioErrors.layers;
    }

    // Return true if no errors
    return Object.keys(errors.value).length === 0;
  }

  function clearErrors() {
    errors.value = {};
  }

  const hasErrors = computed(() => Object.keys(errors.value).length > 0);

  return {
    errors,
    hasErrors,
    validateForm,
    validateName,
    validateEndpoint,
    clearErrors,
  };
}
