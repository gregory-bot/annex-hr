import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The root-level .env is shared by frontend and backend.
const envDir = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '')
  return {
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: `http://localhost:${env.API_PORT || 4000}`, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (/recharts|d3-|victory/.test(id)) return 'charts'
            if (id.includes('framer-motion') || id.includes('motion-')) return 'motion'
            if (/react-dom|react-router|[\\/]react[\\/]|scheduler/.test(id)) return 'react'
            return undefined
          },
        },
      },
    },
  }
})
