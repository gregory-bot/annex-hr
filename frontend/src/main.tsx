import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './context/auth'
import { ThemeProvider, useTheme } from './context/theme'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster theme={theme} position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-sans)' } }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <ThemedToaster />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
