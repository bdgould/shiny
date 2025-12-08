/**
 * IPC handlers for GraphStudio-specific operations
 */

import { ipcMain } from 'electron';
import axios from 'axios';
import https from 'https';
import type { Graphmart, Layer } from '../backends/providers/graphstudio-types.js';

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url;
  return url.startsWith('file://') || url.startsWith('http://localhost:5173');
}

/**
 * Create axios instance with SSL configuration
 */
function createAxiosInstance(allowInsecure: boolean = false) {
  return axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: !allowInsecure,
    }),
    timeout: 15000, // 15 second timeout
  });
}

/**
 * Build authorization headers for GraphStudio API
 */
function getAuthHeaders(credentials?: { username?: string; password?: string }): Record<string, string> {
  if (!credentials || !credentials.username || !credentials.password) {
    return {};
  }

  const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  return {
    'Authorization': `Basic ${encoded}`,
  };
}

/**
 * Parse GraphStudio API response to extract graphmarts
 * Handles different API response formats (v1 vs v2)
 */
function parseGraphmartResponse(data: any): Graphmart[] {
  // Try different response structures
  if (Array.isArray(data)) {
    return data.map(item => normalizeGraphmart(item));
  }

  if (data.graphmarts && Array.isArray(data.graphmarts)) {
    return data.graphmarts.map((item: any) => normalizeGraphmart(item));
  }

  if (data.result && Array.isArray(data.result)) {
    return data.result.map((item: any) => normalizeGraphmart(item));
  }

  // If we can't parse it, return empty array
  return [];
}

/**
 * Normalize graphmart data from API response
 */
function normalizeGraphmart(item: any): Graphmart {
  // Try multiple possible field names for each property
  const uri = item.uri || item.id || item.graphmartUri || item['@id'] || '';
  const name = item.name || item.label || item.title || item.displayName ||
               item.graphmartName || uri.split('/').pop() || 'Unnamed Graphmart';
  const status = normalizeStatus(item.status || item.state || item.graphmartStatus);
  const description = item.description || item.desc || item.comment || '';

  // Try to find layers in various structures
  let layers: any[] = [];
  if (Array.isArray(item.layers)) {
    layers = item.layers;
  } else if (Array.isArray(item.datasets)) {
    layers = item.datasets;
  } else if (Array.isArray(item.dataSets)) {
    layers = item.dataSets;
  } else if (item.layerUris && Array.isArray(item.layerUris)) {
    // If we just have URIs, create minimal layer objects
    layers = item.layerUris.map((uri: string) => ({ uri, name: uri.split('/').pop() || uri }));
  }

  return {
    uri,
    name,
    status,
    description,
    layers: layers.map((layer: any) => normalizeLayer(layer)),
  };
}

/**
 * Normalize layer data from API response
 */
function normalizeLayer(item: any): Layer {
  return {
    uri: item.uri || item.id || '',
    name: item.name || item.label || 'Unnamed Layer',
    type: item.type || 'dataset',
  };
}

/**
 * Normalize status from various API formats
 */
function normalizeStatus(status: any): 'active' | 'inactive' | 'error' {
  if (typeof status !== 'string') {
    return 'inactive';
  }

  const statusLower = status.toLowerCase();

  if (statusLower.includes('active') || statusLower.includes('online') || statusLower.includes('running')) {
    return 'active';
  }

  if (statusLower.includes('error') || statusLower.includes('failed') || statusLower.includes('fault')) {
    return 'error';
  }

  return 'inactive';
}

/**
 * List all graphmarts from GraphStudio server
 */
ipcMain.handle('graphstudio:listGraphmarts', async (event, { baseUrl, credentials, allowInsecure }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Base URL is required');
  }

  try {
    const axiosInstance = createAxiosInstance(allowInsecure);
    const authHeaders = getAuthHeaders(credentials);

    // Try API v2 first (newer versions)
    let response;
    try {
      response = await axiosInstance.get(`${baseUrl}/api/graphmarts`, {
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
        },
      });
    } catch (error) {
      // Fallback to API v1 (older versions)
      response = await axiosInstance.get(`${baseUrl}/api/v1/graphmarts`, {
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
        },
      });
    }

    // Log raw response for debugging
    console.log('[GraphStudio] Raw API response:', JSON.stringify(response.data, null, 2));

    // Parse response
    const graphmarts = parseGraphmartResponse(response.data);

    console.log('[GraphStudio] Parsed graphmarts:', graphmarts.length, 'graphmarts');
    if (graphmarts.length > 0) {
      console.log('[GraphStudio] First graphmart sample:', JSON.stringify(graphmarts[0], null, 2));
    }

    // Sort: active first, then inactive, then error
    graphmarts.sort((a, b) => {
      const statusOrder = { active: 0, inactive: 1, error: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    return graphmarts;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Authentication failed. Please check your credentials.');
      }

      if (statusCode === 404) {
        throw new Error('GraphStudio API not found. Please check the base URL.');
      }

      throw new Error(`Failed to fetch graphmarts (${statusCode || 'network error'}): ${message}`);
    }

    if (error instanceof Error) {
      throw new Error(`Failed to fetch graphmarts: ${error.message}`);
    }

    throw new Error('Failed to fetch graphmarts: Unknown error');
  }
});

/**
 * Get details for a specific graphmart (including layers)
 */
ipcMain.handle('graphstudio:getGraphmartDetails', async (event, { baseUrl, graphmartUri, credentials, allowInsecure }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (typeof baseUrl !== 'string' || !baseUrl) {
    throw new Error('Base URL is required');
  }

  if (typeof graphmartUri !== 'string' || !graphmartUri) {
    throw new Error('Graphmart URI is required');
  }

  try {
    const axiosInstance = createAxiosInstance(allowInsecure);
    const authHeaders = getAuthHeaders(credentials);

    // Encode graphmart URI for URL
    const encodedUri = encodeURIComponent(graphmartUri);

    // Try API v2 first (newer versions)
    let response;
    try {
      response = await axiosInstance.get(`${baseUrl}/api/graphmarts/${encodedUri}`, {
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
        },
      });
    } catch (error) {
      // Fallback to API v1 (older versions)
      response = await axiosInstance.get(`${baseUrl}/api/v1/graphmarts/${encodedUri}`, {
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
        },
      });
    }

    // Parse response
    const graphmart = normalizeGraphmart(response.data.graphmart || response.data);

    return graphmart;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Authentication failed. Please check your credentials.');
      }

      if (statusCode === 404) {
        throw new Error('Graphmart not found.');
      }

      throw new Error(`Failed to fetch graphmart details (${statusCode || 'network error'}): ${message}`);
    }

    if (error instanceof Error) {
      throw new Error(`Failed to fetch graphmart details: ${error.message}`);
    }

    throw new Error('Failed to fetch graphmart details: Unknown error');
  }
});
