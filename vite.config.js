import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// Base path do deploy:
// - GitHub Pages (projeto):  defina VITE_BASE_PATH="/NOME-DO-REPO/"
// - Domínio próprio / Vercel / Netlify:  deixe "/" (padrão)
const BASE_PATH = process.env.VITE_BASE_PATH || '/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
