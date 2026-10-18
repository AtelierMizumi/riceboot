import type { Command } from '../types'

export const clear: Command = async (_a, ctx) => {
  ctx.env.io.clear()
  return 0
}

export const HELP = `riceboot shell — a tiny simulated shell. Built-in commands:

  ls [-a] [path]     list files            cd [dir]        change directory
  pwd                print directory       cat <file>      print a file
  echo <text>        print text            mkdir [-p] dir  make a directory
  touch <file>       create a file         rm [-r] <path>  remove
  clear              clear the screen      help            this help
  fastfetch          system info           hyprctl         talk to the compositor

Redirects (>, >>) and && work. Anything else needs real Linux (coming soon).
`

export const help: Command = async (_a, ctx) => {
  ctx.out(HELP)
  return 0
}
