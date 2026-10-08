/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base + hash routing lets the same build run on GitHub Pages
// (served from /architecture-lab/), a custom domain, or any static host.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@xyflow')) return 'react-flow'
          if (id.includes('framer-motion') || id.includes('motion-dom')) return 'motion'
          if (id.includes('node_modules/react') || id.includes('react-router')) return 'react'
        },
      },
    },
  },
  test: {
    // Logic tests run in node; component tests opt into jsdom with a file comment.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
