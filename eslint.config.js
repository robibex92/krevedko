import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules', 'dist', 'uploads'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off', // Временно off, потом заменим на winston
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },
]

