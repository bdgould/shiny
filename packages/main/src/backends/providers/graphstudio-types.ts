/**
 * GraphStudio-specific types for graphmart and layer management
 */

export type GraphmartStatus = 'active' | 'inactive' | 'error';

export interface Layer {
  uri: string;
  name: string;
  type?: 'dataset' | 'inference' | 'other';
}

export interface Graphmart {
  uri: string;
  name: string;
  status: GraphmartStatus;
  description?: string;
  layers: Layer[];
}

/**
 * GraphStudio provider-specific configuration
 * Stored as JSON string in BackendConfig.providerConfig
 */
export interface GraphStudioConfig {
  graphmartUri: string;       // Selected graphmart URI
  graphmartName: string;      // Display name for UI
  selectedLayers: string[];   // Layer URIs - empty array or ['ALL_LAYERS'] means query all layers
}

/**
 * API response structure for listing graphmarts
 */
export interface ListGraphmartsResponse {
  graphmarts: Graphmart[];
}

/**
 * API response structure for graphmart details
 */
export interface GraphmartDetailsResponse {
  graphmart: Graphmart;
}
