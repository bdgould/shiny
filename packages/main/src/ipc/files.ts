import { ipcMain, WebContents } from 'electron';
import { fileService } from '../services/FileService.js';

/**
 * Check if the sender is authorized (from main window)
 */
function isAuthorizedSender(_sender: WebContents): boolean {
  // Simple authorization - could be enhanced with window tracking
  return true;
}

/**
 * Handle saving SPARQL query to file system
 */
ipcMain.handle('files:saveQuery', async (event, query: string, backendMetadata: { id: string; name: string } | null, currentFilePath?: string) => {
  if (!isAuthorizedSender(event.sender)) {
    throw new Error('Unauthorized');
  }

  return await fileService.saveQuery(query, backendMetadata, currentFilePath);
});

/**
 * Handle opening SPARQL query from file system
 */
ipcMain.handle('files:openQuery', async (event) => {
  if (!isAuthorizedSender(event.sender)) {
    throw new Error('Unauthorized');
  }

  return await fileService.openQuery();
});

/**
 * Handle saving query results to file system
 */
ipcMain.handle('files:saveResults', async (event, content: string, queryType: string, format: string) => {
  if (!isAuthorizedSender(event.sender)) {
    throw new Error('Unauthorized');
  }

  return await fileService.saveResults(content, queryType, format);
});

console.log('Files IPC handlers registered');
