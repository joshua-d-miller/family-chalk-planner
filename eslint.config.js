// Lint the TypeScript server and tests (and later the React screens). public/ is the current browser code,
// replaced by the React screens.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules/', 'public/', 'data/', 'test-results/', 'playwright-report/', 'web/dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error'
    }
  },
  // the screens run in the browser
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser }
  },
  // the tests talk to the server over HTTP and read loosely shaped JSON back
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
);
