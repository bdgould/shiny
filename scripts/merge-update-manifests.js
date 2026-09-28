#!/usr/bin/env node
/**
 * Merge electron-builder update manifests produced by separate per-arch builds.
 *
 * Windows and macOS builds run once per architecture, and each writes its own
 * latest.yml / latest-mac.yml listing only its installer. electron-updater
 * reads a single manifest per platform and picks the file whose name contains
 * the machine's architecture, so the release must ship one manifest listing
 * every architecture.
 *
 * Usage: node scripts/merge-update-manifests.js <out-file> <manifest>...
 *        node scripts/merge-update-manifests.js --verify <release-dir>
 */
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

function load(file) {
  return yaml.load(fs.readFileSync(file, 'utf8'))
}

function merge(manifests) {
  if (manifests.length === 0) throw new Error('No manifests to merge')
  const versions = new Set(manifests.map((m) => m.version))
  if (versions.size !== 1) {
    throw new Error(`Manifests disagree on version: ${[...versions].join(', ')}`)
  }

  const files = []
  const seen = new Set()
  for (const m of manifests) {
    for (const f of m.files || []) {
      if (!seen.has(f.url)) {
        seen.add(f.url)
        files.push(f)
      }
    }
  }

  // Legacy top-level fields: older updaters read `path`. Point it at x64.
  const primary = files.find((f) => f.url.includes('x64')) || files[0]
  const releaseDate = manifests
    .map((m) => m.releaseDate)
    .filter(Boolean)
    .sort()
    .pop()

  return {
    version: manifests[0].version,
    files,
    path: primary.url,
    sha512: primary.sha512,
    ...(releaseDate ? { releaseDate } : {}),
  }
}

/** Every file a manifest references must exist next to it in the release. */
function verify(dir) {
  const manifests = fs.readdirSync(dir).filter((f) => /^latest.*\.yml$/.test(f))
  if (manifests.length === 0) throw new Error(`No update manifests found in ${dir}`)
  const problems = []
  for (const name of manifests) {
    const m = load(path.join(dir, name))
    for (const f of m.files || []) {
      if (!fs.existsSync(path.join(dir, f.url))) problems.push(`${name} -> missing ${f.url}`)
    }
    console.log(`${name}: ${(m.files || []).map((f) => f.url).join(', ')}`)
  }
  if (problems.length) throw new Error(`Broken manifests:\n  ${problems.join('\n  ')}`)
}

function main(argv) {
  if (argv[0] === '--verify') {
    verify(argv[1])
    return
  }
  const [out, ...inputs] = argv
  if (!out || inputs.length === 0) {
    throw new Error('Usage: merge-update-manifests.js <out-file> <manifest>...')
  }
  const merged = merge(inputs.map(load))
  fs.writeFileSync(out, yaml.dump(merged, { lineWidth: -1 }))
  console.log(`Wrote ${out} with ${merged.files.length} files`)
}

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = { merge, verify }
