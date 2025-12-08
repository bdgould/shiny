import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { createMainWindow } from './window';
import { createApplicationMenu } from './menu.js';
import { initializeServices } from './services/index.js';
import { getMigrationService } from './services/MigrationService.js';
import { fileService } from './services/FileService.js';
import './ipc';

// Track the main window for file opening
let mainWindow: BrowserWindow | null = null;

// Track files opened before the app is ready (macOS)
let pendingFileToOpen: string | null = null;

// Handle creating/recreating a window in the app
app.whenReady().then(async () => {
  // Run migrations first (create default backend if needed)
  await getMigrationService().runMigrations();

  // Initialize services (credential storage, backend management)
  initializeServices();

  // Register file association for .rq files
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('shiny', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('shiny');
  }

  mainWindow = createMainWindow();

  // Create the application menu
  createApplicationMenu(mainWindow);

  // If a file was opened before the app was ready, handle it now
  if (pendingFileToOpen) {
    handleFileOpen(pendingFileToOpen);
    pendingFileToOpen = null;
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Allow navigation to localhost in development
    if (parsedUrl.origin !== 'http://localhost:5173' &&
        !parsedUrl.protocol.startsWith('file')) {
      event.preventDefault();
    }
  });

  // Security: Prevent opening new windows
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});

// Handle file opening on macOS (double-click .rq file)
app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (app.isReady() && mainWindow) {
    handleFileOpen(filePath);
  } else {
    // Store the file path to open after the app is ready
    pendingFileToOpen = filePath;
  }
});

// Handle file opening on Windows/Linux (command line argument)
if (process.platform === 'win32' || process.platform === 'linux') {
  // Check if a file was passed as command line argument
  const filePath = process.argv.find(arg => arg.endsWith('.rq') || arg.endsWith('.sparql'));
  if (filePath && app.isReady() && mainWindow) {
    handleFileOpen(filePath);
  } else if (filePath) {
    pendingFileToOpen = filePath;
  }
}

/**
 * Handle opening a .rq file
 */
async function handleFileOpen(filePath: string) {
  if (!mainWindow) return;

  try {
    const result = await fileService.readQueryFile(filePath);

    if ('error' in result) {
      console.error('Error opening file:', result.error);
      return;
    }

    // Send the file data to the renderer
    mainWindow.webContents.send('file:opened', result);
  } catch (error) {
    console.error('Error handling file open:', error);
  }
}
