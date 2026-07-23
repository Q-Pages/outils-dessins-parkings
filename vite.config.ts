import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/outil-dessin-parkings/', // à adapter au nom du dépôt GitHub une fois créé
})
