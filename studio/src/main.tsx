import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerMotion } from './motion/register'
import { MotionProvider } from './motion/MotionProvider'
import { applyTheme } from './theme/theme'
import { applyDensity } from './theme/density'
import { ThemeProvider } from './theme/ThemeProvider'
// Side-effect import: fills the scene registry with lazy loaders. Nothing under src/scenes is
// evaluated here — a scene's chunk is fetched the first time its slot mounts.
import './scenes/registerAll'

// Fonts (Inter Variable, JetBrains Mono Variable) are imported by index.css, not here, so the
// stylesheet stays the one place that says what the page looks like.
import './index.css'

// Theme and density are written onto <html> BEFORE React mounts: the stored preference is a
// synchronous localStorage read, and applying it first means the very first paint is already the
// right colours — a dark-theme user never sees a light flash while React boots. The providers
// below then take over keeping the attributes in step with later changes.
applyTheme()
applyDensity()
// GSAP's one-time plugin registration; a no-op without a window, and idempotent.
registerMotion()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <MotionProvider>
        <App />
      </MotionProvider>
    </ThemeProvider>
  </React.StrictMode>,
)

postMessage({ payload: 'removeLoading' }, '*')
