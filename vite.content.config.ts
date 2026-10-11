import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The content script: one classic script (IIFE) with no imports at run time.
export default defineConfig({
  build: {
    outDir: 'dist/common',
    emptyOutDir: false,
    target: ['chrome137', 'firefox130'],
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      name: 'nodkeyContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
})
