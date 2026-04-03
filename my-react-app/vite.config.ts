import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    watch: {
      ignored: ['**/venv/**'],
    },
  },
  // Exclude venv from dependency scanning — it contains .html files
  // from Python packages that break the build
  optimizeDeps: {
    exclude: [],
    entries: ['index.html'],
  },
})
