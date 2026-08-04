import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from '@stratakit/mui'
import App from './App.tsx'
import { isPatConfigured } from './config'

const patConfigured = isPatConfigured()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root colorScheme="light">
      <App patConfigured={patConfigured} />
    </Root>
  </StrictMode>,
)
