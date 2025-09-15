import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

function getBuildInfo() {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
  let sha = envSha
  try {
    if (!sha) sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch { }
  const short = sha ? sha.substring(0, 7) : 'dev'
  const time = new Date().toISOString()
  return { sha, short, time }
}

const BUILD_INFO = getBuildInfo()

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = env.ALLOWED_HOSTS
    ? env.ALLOWED_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
    : ['*']
  const isProd = mode === 'production'

  return {
    base: isProd ? './' : '/',
    plugins: [react()],
    define: {
      __BUILD_INFO__: JSON.stringify(BUILD_INFO),
    },
    server: {
      fs: {
        // Allow serving artifacts from the repo root if needed
        allow: [
          // project root
          fileURLToPath(new URL('.', import.meta.url)),
          // repo root
          resolve(dirname(fileURLToPath(new URL('.', import.meta.url))), '..', '..')
        ]
      },
      host: true,
      hmr: {
        clientPort: 443,
      },
      allowedHosts,
    }
  }
})
