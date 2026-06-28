#!/usr/bin/env node
// IABar version bumper. Version is generation.feature.patch (semver major.minor.patch):
//   generation (代际)      — major; reset feature + patch to 0
//   feature (功能迭代)     — minor; reset patch to 0
//   patch (补丁)           — auto-incremented by every build
//
// Usage:
//   node scripts/version.mjs                 patch += 1            (default; build uses this)
//   node scripts/version.mjs --feat          feature += 1, patch = 0
//   node scripts/version.mjs --feat 4        set feature = 4, patch = 0
//   node scripts/version.mjs --gen           generation += 1, feature = 0, patch = 0
//   node scripts/version.mjs --gen 2         set generation = 2, feature = 0, patch = 0
//   node scripts/version.mjs --set 1.2.3     set the exact version
//
// pnpm passes trailing args through, so: `pnpm run version:gen 2`, `pnpm run version:feat 4`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

let [major, minor, patch] = String(pkg.version).split('.').map(Number)
if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
  console.error(`✗ current version "${pkg.version}" is not major.minor.patch`)
  process.exit(1)
}

const args = process.argv.slice(2)
// Read a flag's value: `--name=V`, `--name V` (numeric next token), or bare `--name` (→ true).
function flag(name) {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return undefined
  const a = args[i]
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1)
  const next = args[i + 1]
  return next && /^\d+(\.\d+){0,2}$/.test(next) ? next : true
}

const set = flag('set')
const gen = flag('gen')
const feat = flag('feat')

if (set && set !== true) {
  ;[major, minor, patch] = String(set).split('.').map(Number)
} else if (gen !== undefined) {
  major = gen === true ? major + 1 : Number(gen)
  minor = 0
  patch = 0
} else if (feat !== undefined) {
  minor = feat === true ? minor + 1 : Number(feat)
  patch = 0
} else {
  patch += 1
}

if ([major, minor, patch].some((n) => !Number.isInteger(n) || n < 0)) {
  console.error('✗ invalid version components after bump')
  process.exit(1)
}

const next = `${major}.${minor}.${patch}`
pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`▶ version → ${next}`)
