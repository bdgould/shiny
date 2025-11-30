import { BrowserWindow, app } from 'electron';
import * as path from 'path';

export function createMainWindow(): BrowserWindow {
  const isDev = !app.isPackaged;

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Shiny - SPARQL Client',
    webPreferences: {
      // Security: Enable context isolation
      contextIsolation: true,
      // Security: Disable Node integration in renderer
      nodeIntegration: false,
      // Security: Enable sandbox
      sandbox: true,
      // Preload script for secure IPC
      preload: path.join(__dirname, '../../preload/dist/index.js'),
    },
  });

  if (isDev) {
    // In development, load from Vite dev server
    window.loadURL('http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    // In production, load from built files
    window.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  return window;
}
