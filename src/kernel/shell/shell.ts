import { HOME, normalize } from '../vfs'
import { COMMANDS } from './commands'
import { parseLine } from './parse'
import type { CommandCtx, Shell, ShellEnv } from './types'

export type { Shell, ShellEnv, ShellIO, Command } from './types'

const tty = (s: string) => s.replace(/\r?\n/g, '\r\n')

export function createShell(env: ShellEnv): Shell {
  let cwd = HOME
  const user = env.user ?? 'user'
  const host = env.host ?? 'archlinux'
  const resolve = (p: string) => normalize(p, cwd, HOME)

  const shell: Shell = {
    get cwd() {
      return cwd
    },

    prompt() {
      const where = cwd === HOME ? '~' : cwd.startsWith(HOME + '/') ? '~' + cwd.slice(HOME.length) : cwd
      return `\x1b[1;35m${user}\x1b[0m@\x1b[1;34m${host}\x1b[0m \x1b[36m${where}\x1b[0m ❯ `
    },

    async run(line) {
      let code = 0
      for (const seg of parseLine(line)) {
        const [name, ...args] = seg.args
        const cmd = COMMANDS[name]
        if (!cmd) {
          env.io.write(
            tty(
              `riceboot: command not found: ${name}\n` +
                `\x1b[2mhint: this is a simulated shell — boot real Linux to run '${name}' (coming soon)\x1b[0m\n`,
            ),
          )
          return 127
        }
        let buffer = ''
        const ctx: CommandCtx = {
          shell,
          env,
          resolve,
          setCwd: (p) => (cwd = p),
          out: seg.redirect ? (s) => (buffer += s) : (s) => env.io.write(tty(s)),
          err: (s) => env.io.write(tty(s)),
        }
        try {
          code = await cmd(args, ctx)
        } catch (e) {
          env.io.write(tty(`rbsh: ${name}: ${e instanceof Error ? e.message : String(e)}\n`))
          return 1
        }
        if (seg.redirect) {
          const p = resolve(seg.redirect.path)
          try {
            const prev = seg.redirect.append && (await env.vfs.exists(p)) ? await env.vfs.readFile(p) : ''
            await env.vfs.writeFile(p, prev + buffer)
          } catch {
            env.io.write(tty(`rbsh: no such file or directory: ${seg.redirect.path}\n`))
            code = 1
          }
        }
        if (code !== 0) return code
      }
      return code
    },
  }
  return shell
}
