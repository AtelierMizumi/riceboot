import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div data-testid="desktop">riceboot</div>
  </StrictMode>,
)
