import { spawn } from 'node:child_process'
import type { CommandExecutionPort, CommandResult } from '../../application/ports/command-runner'

export class CommandRunner implements CommandExecutionPort {
  run(command: string, args: readonly string[], cwd?: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const started = performance.now()
      const child = spawn(command, [...args], { cwd, shell: false, windowsHide: true })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
      child.on('error', reject)
      child.on('close', code => resolve({
        exitCode: code ?? -1,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        durationMs: performance.now() - started
      }))
    })
  }
}
