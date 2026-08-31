import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const releaseDir = path.resolve(process.argv[2] ?? path.join(rootDir, 'release'))
const outputPath = path.resolve(process.argv[3] ?? path.join(releaseDir, 'latest-mac.yml'))

const files = [
  `BS Coding-${packageJson.version}-mac.zip`,
  `BS Coding-${packageJson.version}-arm64-mac.zip`
].map(name => {
  const filePath = path.join(releaseDir, name)
  return {
    url: name.replace(/[^A-Za-z0-9._-]/g, '.'),
    sha512: createHash('sha512').update(readFileSync(filePath)).digest('base64'),
    size: statSync(filePath).size
  }
})

const lines = [
  `version: ${packageJson.version}`,
  'files:',
  ...files.flatMap(file => [
    `  - url: ${file.url}`,
    `    sha512: ${file.sha512}`,
    `    size: ${file.size}`
  ]),
  `path: ${files[0].url}`,
  `sha512: ${files[0].sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
]

writeFileSync(outputPath, lines.join('\n'))
