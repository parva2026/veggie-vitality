import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `android/` holds generated native scaffolding plus a copy of the built
  // bundle that Capacitor syncs into the APK assets — none of it is our source.
  globalIgnores(['dist', 'android']),
  // Build config runs in Node, not the browser.
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Components referenced only from JSX are not seen as "used" without the
      // react plugin, so capitalised names are exempt as vars and as params
      // (e.g. `{ icon: Icon }` destructured from a config array).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]|^_',
        caughtErrors: 'none',
      }],
    },
  },
])
