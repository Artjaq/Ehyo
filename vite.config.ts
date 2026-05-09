import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/postcss' // Assure-toi que l'import pointe ici
import autoprefixer from 'autoprefixer'
import path from 'path'
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig({
  plugins: [
    vue({
      // Tells Vue's template compiler to treat all Tres* elements
      // as custom renderer nodes — suppresses "unknown component" warnings.
      ...templateCompilerOptions,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
})