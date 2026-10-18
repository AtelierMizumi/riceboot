import { beforeEach, expect, test } from 'vitest'
import { createMemoryVfs } from '../vfs/memory'
import { seedHome } from '../vfs'
import type { Vfs } from '../vfs'
import { createShell, type Shell } from './shell'

// eslint-disable-next-line no-control-regex -- ANSI escape sequences
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')

let vfs: Vfs
let out = ''
let cleared = 0
let sh: Shell
const windows = {
  w1: { id: 'w1', appId: 'terminal', title: 'kitty', workspace: 3, floating: false, fullscreen: false },
}

beforeEach(async () => {
  vfs = createMemoryVfs()
  await seedHome(vfs)
  out = ''
  cleared = 0
  sh = createShell({
    vfs,
    io: { write: (s) => (out += s), clear: () => cleared++ },
    wm: () => ({ windows, active: 3 }),
  })
})

async function run(line: string) {
  out = ''
  const code = await sh.run(line)
  return { code, text: strip(out), raw: out }
}

test('pwd starts in home', async () => {
  expect((await run('pwd')).raw).toBe('/home/user\r\n')
})

test('prompt shows ~ for home and the cwd elsewhere', async () => {
  expect(strip(sh.prompt())).toBe('user@archlinux ~ ❯ ')
  await run('cd /etc')
  expect(strip(sh.prompt())).toBe('user@archlinux /etc ❯ ')
})

test('&& chains commands', async () => {
  const r = await run('mkdir foo && cd foo && pwd')
  expect(r.text).toBe('/home/user/foo\r\n')
  expect(sh.cwd).toBe('/home/user/foo')
})

test('&& stops after a failure', async () => {
  const r = await run('cd nope && pwd')
  expect(r.text).not.toContain('/home/user\r\n')
})

test('cd to missing dir prints error', async () => {
  const r = await run('cd nope')
  expect(r.code).toBe(1)
  expect(r.text).toBe('cd: no such file or directory: nope\r\n')
})

test('cd into a file is an error', async () => {
  const r = await run('cd README.txt')
  expect(r.code).toBe(1)
  expect(r.text).toBe('cd: not a directory: README.txt\r\n')
})

test('cd with no args and cd ~ go home; cd .. at / stays at /', async () => {
  await run('cd /etc')
  await run('cd')
  expect(sh.cwd).toBe('/home/user')
  await run('cd /')
  await run('cd ..')
  expect(sh.cwd).toBe('/')
  await run('cd ~')
  expect(sh.cwd).toBe('/home/user')
})

test('ls lists entries with dirs in blue and hides dotfiles', async () => {
  const r = await run('ls')
  expect(r.raw).toContain('\x1b[1;34mDocuments\x1b[0m')
  expect(r.text).toContain('README.txt')
  expect(r.text).not.toContain('.config')
})

test('ls -a shows dotfiles; ls of a path works', async () => {
  expect((await run('ls -a')).text).toContain('.config')
  expect((await run('ls .config')).text).toContain('hypr')
})

test('ls on missing path errors', async () => {
  const r = await run('ls nope')
  expect(r.code).toBe(1)
  expect(r.text).toBe("ls: cannot access 'nope': No such file or directory\r\n")
})

test('echo with > writes and >> appends; cat reads', async () => {
  await run('echo hi > a.txt')
  expect((await run('cat a.txt')).raw).toBe('hi\r\n')
  await run('echo x >> a.txt')
  expect((await run('cat a.txt')).raw).toBe('hi\r\nx\r\n')
  expect(await vfs.readFile('/home/user/a.txt')).toBe('hi\nx\n')
})

test('cat on missing file errors', async () => {
  const r = await run('cat nope')
  expect(r.code).toBe(1)
  expect(r.text).toBe('cat: nope: No such file or directory\r\n')
})

test('quotes keep spaces', async () => {
  expect((await run('echo "a  b"')).text).toBe('a  b\r\n')
  expect((await run("echo 'x y' z")).text).toBe('x y z\r\n')
})

test('touch creates an empty file; mkdir -p creates parents', async () => {
  await run('touch t')
  expect(await vfs.readFile('/home/user/t')).toBe('')
  await run('mkdir -p a/b/c')
  expect(await vfs.exists('/home/user/a/b/c')).toBe(true)
})

test('rm on dir without -r errors; rm -r removes', async () => {
  const r = await run('rm Documents')
  expect(r.code).toBe(1)
  expect(r.text).toBe("rm: cannot remove 'Documents': Is a directory\r\n")
  expect((await run('rm -r Documents')).code).toBe(0)
  expect(await vfs.exists('/home/user/Documents')).toBe(false)
})

test('unknown command suggests booting real Linux', async () => {
  const r = await run('vim')
  expect(r.code).toBe(127)
  expect(r.text).toContain('riceboot: command not found: vim')
  expect(r.text).toContain('boot real Linux')
})

test('empty line does nothing', async () => {
  const r = await run('   ')
  expect(r.code).toBe(0)
  expect(r.raw).toBe('')
})

test('clear clears the screen', async () => {
  await run('clear')
  expect(cleared).toBe(1)
})

test('help lists commands', async () => {
  const t = (await run('help')).text
  for (const c of ['ls', 'cd', 'cat', 'fastfetch', 'hyprctl']) expect(t).toContain(c)
})

test('fastfetch shows system info with the Arch logo', async () => {
  const t = (await run('fastfetch')).text
  expect(t.split('\r\n')[0]).toContain('/\\')
  for (const s of ['Arch Linux', 'Hyprland', 'kitty', 'user@archlinux']) expect(t).toContain(s)
})

test('hyprctl clients lists windows with workspace', async () => {
  const t = (await run('hyprctl clients')).text
  expect(t).toContain('kitty')
  expect(t).toContain('workspace: 3')
})

test('hyprctl without subcommand prints usage', async () => {
  const r = await run('hyprctl')
  expect(r.code).toBe(1)
  expect(r.text).toContain('usage')
})

test('a command that throws reports an error instead of rejecting', async () => {
  const broken = { ...vfs, readdir: async () => { throw new Error('storage gone') } }
  const s = createShell({ vfs: broken, io: { write: (x) => (out += x), clear: () => {} } })
  out = ''
  const code = await s.run('ls')
  expect(code).toBe(1)
  expect(strip(out)).toBe('rbsh: ls: storage gone\r\n')
})
