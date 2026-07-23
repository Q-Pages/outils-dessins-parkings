import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Actions expose GITHUB_REPOSITORY sous la forme "owner/repo" pendant le build ;
// on en déduit le sous-chemin Pages automatiquement plutôt que de coder en dur le nom du
// dépôt (qui casserait silencieusement tous les chemins d'assets si le dépôt était renommé).
// En local (npm run dev / build hors CI), la variable est absente et base retombe sur '/'.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  plugins: [react()],
  base: repoName ? `/${repoName}/` : '/',
})
