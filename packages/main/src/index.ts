import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { initializeServices } from './services/index.js';
import { getMigrationService } from './services/MigrationService.js';
import './ipc';

// Handle creating/recreating a window in the app
app.whenReady().then(async () => {
  // Run migrations first (create default backend if needed)
  await getMigrationService().runMigrations();

  // Initialize services (credential storage, backend management)
  initializeServices();

  createMainWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
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
