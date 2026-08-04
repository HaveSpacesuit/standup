import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'AZDO_'],
  plugins: [react()],
  build: {
    assetsInlineLimit: (filePath) => !filePath.endsWith('.svg'),
  },
})
