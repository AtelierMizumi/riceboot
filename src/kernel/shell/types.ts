import type { WmState } from '../../compositor/store'
import type { Vfs } from '../vfs'

export interface ShellIO {
  write(s: string): void
  clear(): void
}

export interface ShellEnv {
  vfs: Vfs
  io: ShellIO
  wm?: () => Pick<WmState, 'windows' | 'active'>
  user?: string
  host?: string
}

export interface Shell {
  readonly cwd: string
  prompt(): string
  /** Run one input line; resolves with the exit code of the last command run. */
  run(line: string): Promise<number>
}

export interface CommandCtx {
  shell: Shell
  env: ShellEnv
  setCwd(p: string): void
  /** Absolute path of `p` relative to cwd, with ~ expanded. */
  resolve(p: string): string
  /** Command output (may be redirected to a file). Use "\n"; the shell converts for the terminal. */
  out(s: string): void
  /** Error output, always to the terminal. */
  err(s: string): void
}

export type Command = (args: string[], ctx: CommandCtx) => Promise<number>
