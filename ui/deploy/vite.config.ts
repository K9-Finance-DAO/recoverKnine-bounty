import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow serving artifacts from the repo root if needed
      allow: [
        // project root
        fileURLToPath(new URL('.', import.meta.url)),
        // repo root
        resolve(dirname(fileURLToPath(new URL('.', import.meta.url))), '..', '..')
      ]
    }
  }
})

