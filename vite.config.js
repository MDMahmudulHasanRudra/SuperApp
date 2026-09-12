import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served on port 12000 in every mode:
//   - dev:        vite serves the UI on 12000 and proxies /api to the Express backend
//   - production: Express serves dist/ and /api together on 12000 (see Dockerfile.backend)
// Keeping the port identical means all frontend API calls can stay relative ("/api/...").
const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 12000,
    strictPort: true,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 12000,
    strictPort: true,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
})
