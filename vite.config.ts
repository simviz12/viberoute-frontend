/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
  envPrefix: ['VITE_', 'GOOGLE_'],
  define: {
    global: 'window',
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
