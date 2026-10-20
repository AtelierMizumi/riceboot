import { expect, test, type Page } from '@playwright/test'

async function bootLinux(page: Page) {
  await page.getByTestId('desktop').waitFor()
  await page.keyboard.press('Alt+Enter')
  const term = page.getByTestId('window-terminal').last()
  await page.getByRole('button', { name: 'linux' }).click()
  await expect(term).toContainText('login:', { timeout: 300_000 })
  await page.keyboard.type('root')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('riceboot: packages ready', { timeout: 60_000 })
  return term
}

test('a file written in linux survives a reload, and reset removes it', async ({ page }) => {
  test.setTimeout(900_000)
  await page.goto('/')
  await bootLinux(page)
  await page.keyboard.type('echo persisted-yes > /root/keep.txt && sync')
  await page.keyboard.press('Enter')
  // Changes are captured every 2 s and saved after a 2 s debounce, so wait out that window before reloading.
  await page.waitForTimeout(6000)

  await page.reload()
  const term = await bootLinux(page)
  await page.keyboard.type('cat /root/keep.txt')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('persisted-yes', { timeout: 60_000 })

  await page.getByRole('button', { name: 'reset' }).click()
  await page.getByRole('button', { name: 'linux' }).click()
  // screenReaderMode repeats terminal lines in the DOM, so counting markers is unreliable. Instead, wait for
  // the markers to appear after the single "was reset" line that Reset prints.
  const after = async (marker: string) => {
    const t = await term.innerText()
    const r = t.lastIndexOf('was reset to the packaged image')
    return r >= 0 && t.lastIndexOf(marker) > r
  }
  await expect.poll(() => after('login:'), { timeout: 300_000 }).toBe(true)
  await page.keyboard.type('root')
  await page.keyboard.press('Enter')
  await expect.poll(() => after('riceboot: packages ready'), { timeout: 60_000 }).toBe(true)
  await page.keyboard.type('cat /root/keep.txt; echo gone-$?')
  await page.keyboard.press('Enter')
  await expect(term).toContainText('gone-1', { timeout: 60_000 })
})
