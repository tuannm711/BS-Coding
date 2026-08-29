export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface CommandExecutionPort {
  run(command: string, args: readonly string[], cwd?: string): Promise<CommandResult>
}
