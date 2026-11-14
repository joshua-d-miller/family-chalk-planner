/*
===============================================================================
 Family Chalk Planner | Build | eslint.config.js
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     The lint rules for the server, the tests and the screens (React).
     public/ is the old board's browser code and isn't linted.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    TypeScript groundwork: type-check, lint and
                        claude    format in CI; chores is the first TypeScript
                        colby     module.

                                  Server and tests are all TypeScript (ES
                                  modules).

                                  The new screens (React + TypeScript): meal
                                  plan, reminders, timers, pantry, jars and
                                  chores.
===============================================================================
*/

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules/', 'public/', 'data/', 'test-results/', 'playwright-report/', 'test-results-ha/', 'playwright-report-ha/', 'web/dist/'] },
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
