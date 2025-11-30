#!/usr/bin/env node

const { spawn } = require('child_process');
const { join } = require('path');
const waitOn = require('wait-on');

const rootDir = join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(prefix, color, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

// Track running processes
const processes = [];

function cleanup() {
  log('CLEANUP', colors.yellow, 'Stopping all processes...');
  processes.forEach(p => {
    if (p && !p.killed) {
      p.kill();
    }
  });
  process.exit(0);
}

// Handle cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function startDev() {
  log('DEV', colors.cyan, 'Starting Shiny in development mode...');

  // 1. Compile TypeScript for main process (watch mode)
  log('MAIN', colors.green, 'Compiling main process TypeScript...');
  const mainTsc = spawn('npm', ['run', 'watch'], {
    cwd: join(rootDir, 'packages/main'),
    shell: true,
    stdio: 'inherit',
  });
  processes.push(mainTsc);

  // 2. Compile TypeScript for preload script (watch mode)
  log('PRELOAD', colors.green, 'Compiling preload TypeScript...');
  const preloadTsc = spawn('npm', ['run', 'watch'], {
    cwd: join(rootDir, 'packages/preload'),
    shell: true,
    stdio: 'inherit',
  });
  processes.push(preloadTsc);

  // 3. Start Vite dev server for renderer
  log('RENDERER', colors.green, 'Starting Vite dev server...');
  const vite = spawn('npm', ['run', 'dev'], {
    cwd: join(rootDir, 'packages/renderer'),
    shell: true,
    stdio: 'inherit',
  });
  processes.push(vite);

  // 4. Wait for initial compilation and Vite server
  log('WAIT', colors.yellow, 'Waiting for build processes...');

  try {
    // Wait for Vite dev server
    await waitOn({
      resources: ['http://localhost:5173'],
      timeout: 30000,
      interval: 100,
    });

    // Give TypeScript a moment to compile
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. Start Electron
    log('ELECTRON', colors.green, 'Starting Electron...');
    const electron = spawn('npx', ['electron', 'packages/main/dist/index.js'], {
      cwd: rootDir,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    processes.push(electron);

    electron.on('exit', (code) => {
      if (code !== null) {
        log('ELECTRON', colors.yellow, `Exited with code ${code}`);
        cleanup();
      }
    });

  } catch (error) {
    log('ERROR', colors.red, `Failed to start: ${error.message}`);
    cleanup();
  }
}

startDev().catch((error) => {
  log('ERROR', colors.red, error.message);
  cleanup();
});
