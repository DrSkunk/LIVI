import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let version
try {
  version = require('@biomejs/biome/package.json').version
} catch {
  // biome not installed (e.g. --ignore-scripts / production install) — nothing to do
  process.exit(0)
}

const path = new URL('../biome.json', import.meta.url)

let before
try {
  before = readFileSync(path, 'utf8')
} catch {
  process.exit(0)
}

const after = before.replace(/(schemas\/)\d+\.\d+\.\d+(\/schema\.json)/, `$1${version}$2`)

if (after !== before) {
  writeFileSync(path, after)
  console.log(`[biome] synced $schema -> ${version}`)
}
