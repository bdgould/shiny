#!/usr/bin/env node
const { spawn } = require('child_process')
const { join } = require('path')

const rootDir = join(__dirname, '..')

function log(msg) {
  console.log(`\x1b[36m[BUILD]\x1b[0m ${msg}`)
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    log(`Executing ${command} ${args.join(' ')}...`)
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: process.env,
    })
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed with code ${code}`))
    })
  })
}

async function build() {
  try {
    // 1. Clean old builds (optional, but recommended)
    // await run('rm', ['-rf', 'dist'], rootDir);

    // 2. Build Renderer (Vite)
    log('Building Renderer...')
    await run('npm', ['run', 'build'], join(rootDir, 'packages/renderer'))

    // 3. Build Main Process (TSC)
    log('Building Main process...')
    await run('npm', ['run', 'build'], join(rootDir, 'packages/main'))

    // 4. Build Preload (TSC)
    log('Building Preload...')
    await run('npm', ['run', 'build'], join(rootDir, 'packages/preload'))

    // 5. Package with Electron Builder
    log('Packaging application...')
    // This uses the configuration from your root package.json
    await run('npx', ['electron-builder'], rootDir)

    log('Build complete!')
  } catch (e) {
    console.error('\x1b[31mBuild failed:\x1b[0m', e.message)
    process.exit(1)
  }
}

build()
