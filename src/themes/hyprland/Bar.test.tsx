import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { cleanup } from '@testing-library/react'
import { WmProvider } from '../../compositor/context'
import { createWmStore } from '../../compositor/store'
import Bar from './Bar'

afterEach(cleanup)

function setup() {
  const wm = createWmStore()
  wm.getState().open('terminal', 'first')
  wm.getState().switchWorkspace(3)
  wm.getState().open('terminal', 'user@archlinux: ~')
  render(
    <WmProvider store={wm}>
      <Bar height={34} />
    </WmProvider>,
  )
  return wm
}

test('shows workspaces 1..5 with active and occupied state', () => {
  setup()
  const buttons = screen.getAllByRole('button', { name: /workspace/i })
  expect(buttons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5'])
  expect(screen.getByRole('button', { name: 'workspace 3' }).getAttribute('aria-current')).toBe('true')
  expect(screen.getByRole('button', { name: 'workspace 1' }).className).toContain('occupied')
  expect(screen.getByRole('button', { name: 'workspace 2' }).className).not.toContain('occupied')
})

test('occupied workspaces above 5 are shown', () => {
  const wm = setup()
  act(() => {
    wm.getState().switchWorkspace(8)
    wm.getState().open('terminal', 'x')
  })
  expect(screen.getAllByRole('button', { name: /workspace/i }).map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5', '8'])
})

test('clicking a workspace switches to it', () => {
  const wm = setup()
  fireEvent.click(screen.getByRole('button', { name: 'workspace 1' }))
  expect(wm.getState().active).toBe(1)
})

test('shows focused window title and a clock', () => {
  setup()
  expect(screen.getByTestId('bar').textContent).toContain('user@archlinux: ~')
  expect(screen.getByTestId('clock').textContent).toMatch(/\d{2}:\d{2}/)
})
