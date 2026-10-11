import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import globals from 'globals'

export default defineConfigWithVueTs(
  { ignores: ['target/**', 'dist/**', 'node_modules/**', 'src/wasm/**', 'public/**'] },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Prettier owns formatting.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: [
      'scripts/**/*.mjs',
      'tests/e2e/**/*.mjs',
      'vite.config.ts',
      'vite.content.config.ts',
      'eslint.config.mjs',
    ],
    extends: [vueTsConfigs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
)
