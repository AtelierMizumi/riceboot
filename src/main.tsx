import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Boot from './boot/Boot'
import Desktop from './desktop/Desktop'
import { createVfs, seedHome, type Vfs } from './kernel/vfs'
import { loadTheme, type ThemePack } from './themes'
import './index.css'

const loading: Promise<{ vfs: Vfs; theme: ThemePack }> = (async () => {
  const [vfs, theme] = await Promise.all([createVfs(), loadTheme('hyprland')])
  await seedHome(vfs)
  return { vfs, theme }
})()

function App() {
  const [system, setSystem] = useState<{ vfs: Vfs; theme: ThemePack } | null>(null)
  if (!system) return <Boot ready={loading} onDone={() => void loading.then(setSystem)} />
  return <Desktop vfs={system.vfs} theme={system.theme} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
