import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'out', 'browser-native-host')
mkdirSync(output, { recursive: true })
await build({
  entryPoints: [path.join(root, 'src', 'browser-native-host', 'host.ts')],
  outfile: path.join(output, 'host.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'info'
})

if (process.platform === 'win32') {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const candidates = ['Framework64', 'Framework'].map(framework => path.join(systemRoot, 'Microsoft.NET', framework, 'v4.0.30319', 'csc.exe'))
  const compiler = candidates.find(candidate => existsSync(candidate))
  if (!compiler) throw new Error('Windows .NET Framework compiler is required to build the native browser launcher')
  execFileSync(compiler, [
    '/nologo', '/target:winexe', '/optimize+', '/reference:System.Web.Extensions.dll',
    `/out:${path.join(output, 'launcher.exe')}`,
    path.join(root, 'src', 'browser-native-host', 'Launcher.cs')
  ], { windowsHide: true, stdio: 'pipe', timeout: 30000 })
}
console.log(`[build:native-host] output: ${output}`)
