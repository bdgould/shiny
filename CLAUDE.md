# Shiny

Electron + Vue 3 + TypeScript SPARQL client. npm workspaces: `packages/main` (Electron main, CommonJS), `packages/preload` (contextBridge), `packages/renderer` (Vue 3, Vite 8).

## Environment

- Use Node 24 (`nvm use`; `.nvmrc` pins v24). npm 10 crashes resolving this lockfile.

## Commands

```bash
npm run dev             # Vite dev server + tsc watch + Electron
npm run type-check      # main, preload, renderer (vue-tsc), e2e
npm run lint            # ESLint 10 flat config (eslint.config.mjs)
npm run format:check
npm test                # unit tests, all packages
npm run test:coverage   # unit tests with per-package coverage floors
npm run test:e2e        # Playwright drives the real app (builds main + preload first)
```

`SHINY_E2E_EXECUTABLE=dist/mac-arm64/Shiny.app/Contents/MacOS/Shiny npm run test:e2e` runs the e2e suite against a packaged build (`npx electron-builder --dir` after building all three packages).

## Conventions

- Unit tests live in `__tests__/` next to the code. Coverage is measured over all source files; the floors in each `vitest.config.ts` are ratchets. Raise them when coverage improves, never lower them.
- Every `ipcMain.handle` must call `isAuthorizedSender` from `packages/main/src/ipc/security.ts` first.
- Main compiles with `module: node20` (CommonJS output that can `require()` ESM-only packages). Relative imports, including dynamic `import()` in tests, need a `.js` extension.
- Main and preload builds use `tsconfig.build.json` (excludes tests). The plain `tsconfig.json` is for type-checking and includes tests.
- The renderer imports Monaco from `monaco-editor/editor/editor.api` plus `features/register.all`, not the package root, which bundles every language worker.
- Settings getters in `renderer/src/services/preferences/appSettings.ts` return `structuredClone` of defaults; never hand out the shared default objects.
- Backends and credentials live in the electron-store named `shiny-config`.

## Releases

Every push to `main` without `[skip ci]` tags `v<version>`, builds installers (`.github/workflows/build.yml`: macOS, Windows, Linux, each x64 and arm64), publishes a GitHub release, and a bot commits the next version bump. Prefer one merge per release.

- `scripts/merge-update-manifests.js` merges the per-arch `latest.yml` / `latest-mac.yml` into one; electron-updater picks the file whose name contains the machine's arch, so artifact names must include `${arch}`.
- Auto-update (`packages/main/src/updater.ts`) installs on Windows and Linux. macOS builds are unsigned, so macOS only gets a notice with a download link. Set `SHINY_DISABLE_UPDATES=1` to disable (e2e does).
- PRs that touch packaging run `package-check.yml`, which builds every installer.
