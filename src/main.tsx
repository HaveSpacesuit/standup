import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from '@stratakit/mui'
import App from './App.tsx'
import { isPatConfigured } from './config'

const patConfigured = isPatConfigured()
const COLOR_SCHEME_STORAGE_KEY = 'standup:color-scheme'

type ColorScheme = 'light' | 'dark'

function getInitialColorScheme(): ColorScheme {
  const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function AppRoot() {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getInitialColorScheme)

  useEffect(() => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme)
  }, [colorScheme])

  const handleToggleColorScheme = () => {
    setColorScheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <Root colorScheme={colorScheme}>
      <App
        patConfigured={patConfigured}
        colorScheme={colorScheme}
        onToggleColorScheme={handleToggleColorScheme}
      />
    </Root>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
