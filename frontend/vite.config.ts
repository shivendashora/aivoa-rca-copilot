import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward /api calls to FastAPI so the frontend never hardcodes the backend URL
    proxy: { '/api': 'http://localhost:8000' },
  },
})
