#!/usr/bin/env node

/**
 * Version bumping script for Shiny monorepo
 * Increments the patch version across all workspace packages
 */

const fs = require('fs')
const path = require('path')

// Parse semver version and increment patch
function incrementPatchVersion(version) {
  const parts = version.split('.')
  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}`)
  }

  const [major, minor, patch] = parts
  const newPatch = parseInt(patch, 10) + 1

  return `${major}.${minor}.${newPatch}`
}

// Update version in a package.json file
function updatePackageVersion(filePath, newVersion) {
  const content = fs.readFileSync(filePath, 'utf8')
  const pkg = JSON.parse(content)

  const oldVersion = pkg.version
  pkg.version = newVersion

  // Write back with proper formatting (2 spaces, newline at end)
  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

  console.log(`✓ Updated ${filePath}: ${oldVersion} → ${newVersion}`)
  return oldVersion
}

// Main execution
function main() {
  try {
    const rootDir = path.resolve(__dirname, '..')
    const rootPackageJsonPath = path.join(rootDir, 'package.json')

    // Read current version from root package.json
    const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))
    const currentVersion = rootPkg.version

    console.log(`Current version: ${currentVersion}`)

    // Calculate new version
    const newVersion = incrementPatchVersion(currentVersion)
    console.log(`New version: ${newVersion}`)
    console.log('')

    // Update root package.json
    updatePackageVersion(rootPackageJsonPath, newVersion)

    // Update all workspace package.json files
    const workspacePackages = ['main', 'preload', 'renderer']

    for (const pkg of workspacePackages) {
      const pkgPath = path.join(rootDir, 'packages', pkg, 'package.json')

      if (fs.existsSync(pkgPath)) {
        updatePackageVersion(pkgPath, newVersion)
      } else {
        console.warn(`⚠ Warning: ${pkgPath} not found, skipping`)
      }
    }

    console.log('')
    console.log(`✓ Version bump complete: ${currentVersion} → ${newVersion}`)
    process.exit(0)
  } catch (error) {
    console.error('✗ Error bumping version:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

module.exports = { incrementPatchVersion, updatePackageVersion }
