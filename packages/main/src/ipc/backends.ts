/**
 * IPC handlers for backend management
 */

import { ipcMain } from 'electron';
import { getBackendService } from '../services/index.js';

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url;
  return url.startsWith('file://') || url.startsWith('http://localhost:5173');
}

/**
 * Get all backends
 */
ipcMain.handle('backends:getAll', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  const backendService = getBackendService();
  return await backendService.getAllBackends();
});

/**
 * Create a new backend
 */
ipcMain.handle('backends:create', async (event, { config, credentials }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid backend config');
  }

  const backendService = getBackendService();
  return await backendService.createBackend(config, credentials);
});

/**
 * Update an existing backend
 */
ipcMain.handle('backends:update', async (event, { id, updates, credentials }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (typeof id !== 'string' || !id) {
    throw new Error('Invalid backend ID');
  }

  if (!updates || typeof updates !== 'object') {
    throw new Error('Invalid backend updates');
  }

  const backendService = getBackendService();
  return await backendService.updateBackend(id, updates, credentials);
});

/**
 * Delete a backend
 */
ipcMain.handle('backends:delete', async (event, { id }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (typeof id !== 'string' || !id) {
    throw new Error('Invalid backend ID');
  }

  const backendService = getBackendService();
  await backendService.deleteBackend(id);

  return { success: true };
});

/**
 * Test connection to a backend
 */
ipcMain.handle('backends:testConnection', async (event, { id }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input
  if (typeof id !== 'string' || !id) {
    throw new Error('Invalid backend ID');
  }

  const backendService = getBackendService();
  const result = await backendService.testConnection(id);

  return result;
});

/**
 * Get selected backend ID
 */
ipcMain.handle('backends:getSelected', async (event) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  const backendService = getBackendService();
  return backendService.getSelectedBackendId();
});

/**
 * Select a backend
 */
ipcMain.handle('backends:setSelected', async (event, { id }) => {
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Validate input (allow null for deselection)
  if (id !== null && (typeof id !== 'string' || !id)) {
    throw new Error('Invalid backend ID');
  }

  const backendService = getBackendService();
  await backendService.selectBackend(id);

  return { success: true };
});
