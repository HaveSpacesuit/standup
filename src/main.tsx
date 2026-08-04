import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from '@stratakit/mui'
import App from './App.tsx'
import { validateAppConfig } from './config'

validateAppConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root colorScheme="light">
      <App />
    </Root>
  </StrictMode>,
)
