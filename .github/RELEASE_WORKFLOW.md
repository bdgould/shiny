# GitHub Actions Release Workflow

This document explains how the automated release workflow works for the Shiny application.

## Overview

The release workflow automatically creates versioned releases with multi-platform builds whenever code is pushed to the `main` branch.

## Workflow Trigger

- **Automatic**: Every push to `main` branch
- **Manual**: Can also be triggered manually from GitHub Actions UI (if needed)

## Workflow Steps

### 1. Validation
Before building, the workflow validates code quality:
- Runs `npm run lint` to check for linting errors
- Runs `npm run type-check` to verify TypeScript types
- **If validation fails, the workflow stops and no release is created**

### 2. Prepare Release
- Reads the current version from `package.json` (e.g., `0.1.0`)
- Creates a git tag `v{version}` (e.g., `v0.1.0`)
- Pushes the tag to GitHub
- **If the tag already exists, the workflow skips the release** (prevents duplicate releases)

### 3. Build Applications
Builds are created in parallel for multiple platforms and architectures:

**macOS Builds** (runs on `macos-latest`):
- **x64** (Intel): `Shiny-{version}-x64.dmg`
- **arm64** (Apple Silicon): `Shiny-{version}-arm64.dmg`

**Windows Builds** (runs on `windows-latest`):
- **x64**: `Shiny Setup {version}.exe`
- **arm64**: `Shiny Setup {version} arm64.exe`

### 4. Create GitHub Release
- Creates a new GitHub Release with tag `v{version}`
- Generates release notes automatically from commits
- Attaches all build artifacts (DMGs and EXE installers)
- Includes auto-update metadata files (`latest-mac.yml`, `latest.yml`)

### 5. Bump Version
After a successful release:
- Increments the patch version (e.g., `0.1.0` → `0.1.1`)
- Updates version in all package.json files:
  - Root `package.json`
  - `packages/main/package.json`
  - `packages/preload/package.json`
  - `packages/renderer/package.json`
- Commits changes with message: `chore: bump version to v{new_version} [skip ci]`
- Pushes the commit back to `main`
- The `[skip ci]` tag prevents the workflow from triggering again

## Version Control

### Automatic Patch Bumps
By default, the patch version is auto-incremented after each release:
- `0.1.0` → `0.1.1` → `0.1.2` → etc.

### Manual Version Changes
To create a minor or major version bump:

1. **Manually edit** the version in `package.json`:
   ```json
   {
     "version": "0.2.0"  // or "1.0.0" for major
   }
   ```

2. **Commit and push** to `main`:
   ```bash
   git add package.json
   git commit -m "chore: bump to v0.2.0"
   git push origin main
   ```

3. The workflow will:
   - Create tag `v0.2.0`
   - Build and release with version `0.2.0`
   - Auto-bump to `0.2.1` for the next release

## Build Artifacts

Each release includes the following files:

### macOS
- `Shiny-{version}-x64.dmg` - Intel Mac installer
- `Shiny-{version}-arm64.dmg` - Apple Silicon installer
- `latest-mac.yml` - Auto-update metadata

### Windows
- `Shiny Setup {version}.exe` - x64 installer
- `Shiny Setup {version} arm64.exe` - ARM64 installer
- `latest.yml` - Auto-update metadata

## Code Signing

### Current Status: Unsigned
Currently, applications are **not code-signed**. Users will see security warnings when installing.

### Future: Adding Code Signing
To enable code signing, add these secrets to your GitHub repository:

**For macOS**:
- `APPLE_ID` - Your Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password from Apple
- `APPLE_TEAM_ID` - Your Apple Developer Team ID

**For Windows**:
- `WIN_CSC_LINK` - Base64-encoded Windows certificate
- `WIN_CSC_KEY_PASSWORD` - Certificate password

The workflow is already configured to use these secrets when available.

## Monitoring Releases

### View Workflow Status
1. Go to **Actions** tab in GitHub
2. Click on the latest workflow run
3. View logs for each job (validate, build-macos, build-windows, create-release)

### Download Artifacts
1. Go to **Releases** tab in GitHub
2. Click on the desired release version
3. Download the installer for your platform

## Troubleshooting

### Release Skipped
If you see "Tag already exists, skipping release":
- The current version already has a tag/release
- Either manually bump the version in package.json, or wait for the auto-bump commit

### Build Failed
If a build job fails:
1. Check the workflow logs in the Actions tab
2. Look for errors in validation, build, or packaging steps
3. Fix the issue and push a new commit

### Version Out of Sync
If package versions become inconsistent:
```bash
npm run bump-version
```
This will sync all package.json files to the next version.

## Workflow Files

- `.github/workflows/release.yml` - Main workflow definition
- `scripts/bump-version.js` - Version bumping script
- `package.json` - Build configuration and scripts

## Customization

### Change Auto-Bump Behavior
Edit `scripts/bump-version.js` to change from patch to minor:
```javascript
const newPatch = parseInt(patch, 10) + 1;
// Change to:
const newMinor = parseInt(minor, 10) + 1;
return `${major}.${newMinor}.0`;
```

### Add Linux Builds
Uncomment the Linux build job in `.github/workflows/release.yml` and add:
```yaml
build-linux:
  name: Build Linux
  needs: prepare-release
  runs-on: ubuntu-latest
  # ... similar to macOS/Windows jobs
```

### Skip CI for Specific Commits
Add `[skip ci]` to your commit message to prevent the workflow from running.

## Best Practices

1. **Test before pushing to main** - Run `npm run lint` and `npm run type-check` locally
2. **Use feature branches** - Merge PRs into main for releases
3. **Write meaningful commit messages** - They appear in release notes
4. **Review auto-generated release notes** - Edit them if needed after creation
5. **Keep dist/ in .gitignore** - Build artifacts are created in CI, not committed

## Questions?

For issues or questions about the release workflow, check:
- GitHub Actions logs
- This documentation
- `.github/workflows/release.yml` source code
