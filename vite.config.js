import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Base path do deploy:
// - GitHub Pages (projeto):  defina VITE_BASE_PATH="/NOME-DO-REPO/"
// - Domínio próprio / Vercel / Netlify:  deixe "/" (padrão)
const BASE_PATH = process.env.VITE_BASE_PATH || '/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
