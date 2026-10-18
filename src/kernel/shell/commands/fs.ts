import type { Command } from '../types'

const BLUE = '\x1b[1;34m'
const RESET = '\x1b[0m'

export const pwd: Command = async (_a, ctx) => {
  ctx.out(ctx.shell.cwd + '\n')
  return 0
}

export const cd: Command = async ([target], ctx) => {
  const p = ctx.resolve(target ?? '~')
  if (!(await ctx.env.vfs.exists(p))) {
    ctx.err(`cd: no such file or directory: ${target}\n`)
    return 1
  }
  if ((await ctx.env.vfs.stat(p)).type !== 'dir') {
    ctx.err(`cd: not a directory: ${target}\n`)
    return 1
  }
  ctx.setCwd(p)
  return 0
}

export const ls: Command = async (args, ctx) => {
  const all = args.some((a) => /^-\w*a/.test(a))
  const paths = args.filter((a) => !a.startsWith('-'))
  const { vfs } = ctx.env
  let code = 0
  for (const target of paths.length ? paths : ['.']) {
    const p = ctx.resolve(target)
    if (!(await vfs.exists(p))) {
      ctx.err(`ls: cannot access '${target}': No such file or directory\n`)
      code = 1
      continue
    }
    if ((await vfs.stat(p)).type === 'file') {
      ctx.out(target + '\n')
      continue
    }
    const names = (await vfs.readdir(p)).filter((n) => all || !n.startsWith('.'))
    const shown: string[] = []
    for (const n of names) {
      const isDir = (await vfs.stat(p === '/' ? '/' + n : `${p}/${n}`)).type === 'dir'
      shown.push(isDir ? `${BLUE}${n}${RESET}` : n)
    }
    if (paths.length > 1) ctx.out(`${target}:\n`)
    if (shown.length) ctx.out(shown.join('  ') + '\n')
  }
  return code
}

export const cat: Command = async (args, ctx) => {
  let code = 0
  for (const f of args) {
    try {
      ctx.out(await ctx.env.vfs.readFile(ctx.resolve(f)))
    } catch (e) {
      const isDir = (e as { code?: string }).code === 'EISDIR'
      ctx.err(`cat: ${f}: ${isDir ? 'Is a directory' : 'No such file or directory'}\n`)
      code = 1
    }
  }
  return code
}

export const echo: Command = async (args, ctx) => {
  ctx.out(args.join(' ') + '\n')
  return 0
}

export const mkdir: Command = async (args, ctx) => {
  const recursive = args.includes('-p')
  let code = 0
  for (const d of args.filter((a) => a !== '-p')) {
    try {
      await ctx.env.vfs.mkdir(ctx.resolve(d), { recursive })
    } catch (e) {
      const c = (e as { code?: string }).code
      ctx.err(`mkdir: cannot create directory '${d}': ${c === 'EEXIST' ? 'File exists' : 'No such file or directory'}\n`)
      code = 1
    }
  }
  return code
}

export const touch: Command = async (args, ctx) => {
  let code = 0
  for (const f of args) {
    const p = ctx.resolve(f)
    try {
      if (!(await ctx.env.vfs.exists(p))) await ctx.env.vfs.writeFile(p, '')
    } catch {
      ctx.err(`touch: cannot touch '${f}': No such file or directory\n`)
      code = 1
    }
  }
  return code
}

export const rm: Command = async (args, ctx) => {
  const recursive = args.some((a) => /^-\w*[rR]/.test(a))
  const { vfs } = ctx.env
  let code = 0
  for (const f of args.filter((a) => !a.startsWith('-'))) {
    const p = ctx.resolve(f)
    if (p === '/') {
      ctx.err("rm: it is dangerous to operate recursively on '/'\n")
      code = 1
      continue
    }
    if (!(await vfs.exists(p))) {
      ctx.err(`rm: cannot remove '${f}': No such file or directory\n`)
      code = 1
      continue
    }
    if ((await vfs.stat(p)).type === 'dir' && !recursive) {
      ctx.err(`rm: cannot remove '${f}': Is a directory\n`)
      code = 1
      continue
    }
    await vfs.rm(p, { recursive: true })
  }
  return code
}
