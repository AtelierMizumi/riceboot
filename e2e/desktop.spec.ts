import { expect, test, type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('desktop')).toBeVisible({ timeout: 5000 })
}

async function openTerminal(page: Page) {
  const before = await page.getByTestId('window-terminal').count()
  await page.keyboard.press('Alt+Enter')
  await expect(page.getByTestId('window-terminal')).toHaveCount(before + 1)
  const term = page.getByTestId('window-terminal').last()
  await expect(term).toContainText('Welcome to riceboot')
  return term
}

async function runIn(page: Page, cmd: string) {
  await page.keyboard.type(cmd)
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => indexedDB.deleteDatabase('riceboot-vfs'))
})

test('desktop boots cross-origin isolated', async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)
  await expect(page.getByTestId('bar')).toBeVisible()
  await expect(page.getByText('Alt + Enter')).toBeVisible()
})

test('Alt+Enter opens a terminal that runs fastfetch', async ({ page }) => {
  await boot(page)
  const term = await openTerminal(page)
  await runIn(page, 'fastfetch')
  await expect(term).toContainText('Arch Linux')
  await expect(term).toContainText('Hyprland')
})

test('two terminals tile side by side, Alt+Q closes, Alt+2 switches workspace', async ({ page }) => {
  await boot(page)
  await openTerminal(page)
  await openTerminal(page)
  const wins = page.getByTestId('window-terminal')
  await expect
    .poll(async () => {
      const [a, b] = [await wins.nth(0).boundingBox(), await wins.nth(1).boundingBox()]
      return a && b ? a.x + a.width <= b.x || b.x + b.width <= a.x : false
    })
    .toBe(true)
  await page.keyboard.press('Alt+q')
  await expect(wins).toHaveCount(1)
  await page.keyboard.press('Alt+2')
  await expect(page.getByRole('button', { name: 'workspace 2' })).toHaveAttribute('aria-current', 'true')
  await expect(wins.first()).toBeHidden()
  await page.keyboard.press('Alt+1')
  await expect(wins.first()).toBeVisible()
})

test('files written in the terminal survive a reload', async ({ page }) => {
  await boot(page)
  await openTerminal(page)
  await runIn(page, 'echo persisted-hi > t.txt')
  await page.waitForTimeout(200)
  await page.reload()
  await expect(page.getByTestId('desktop')).toBeVisible({ timeout: 5000 })
  const term = await openTerminal(page)
  await runIn(page, 'cat t.txt')
  await expect(term).toContainText('persisted-hi')
})
