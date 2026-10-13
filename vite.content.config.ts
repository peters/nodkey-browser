import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** The scripts that run in web pages, each one classic script (IIFE) with no imports. */
const SCRIPTS = {
  content: 'src/content/index.ts',
  'passkey-bridge': 'src/passkeys/bridge.ts',
  'passkey-page': 'src/passkeys/page.ts',
}

// Builds the script that `NODKEY_SCRIPT` names (default: the content script).
const name = (process.env.NODKEY_SCRIPT ?? 'content') as keyof typeof SCRIPTS
const entry = SCRIPTS[name]
if (!entry) throw new Error(`unknown page script ${name}`)

export default defineConfig({
  build: {
    outDir: 'dist/common',
    emptyOutDir: false,
    target: ['chrome137', 'firefox130'],
    lib: {
      entry: resolve(import.meta.dirname, entry),
      name: `nodkey_${name.replace('-', '_')}`,
      formats: ['iife'],
      fileName: () => `${name}.js`,
    },
  },
})
