import { useState } from 'react'
import { Root } from '@stratakit/mui'
import App from './App.tsx'
import { COLOR_SCHEME_STORAGE_KEY } from './appSettings'

type ColorScheme = 'light' | 'dark'

function getInitialColorScheme(): ColorScheme {
  const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function AppRoot() {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getInitialColorScheme)

  const handleToggleColorScheme = () => {
    setColorScheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  return (
    <Root colorScheme={colorScheme}>
      <App
        colorScheme={colorScheme}
        onToggleColorScheme={handleToggleColorScheme}
      />
    </Root>
  )
}
