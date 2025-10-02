import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Replace REPO_NAME with your repo name
export default defineConfig({
  plugins: [react()],
  base: '/notes/',
})