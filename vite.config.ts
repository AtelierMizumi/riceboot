/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [react({ compiler: true })],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'jsdom',
    setupFiles: ['fake-indexeddb/auto'],
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
