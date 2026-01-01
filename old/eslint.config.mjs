import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angularPlugin from '@angular-eslint/eslint-plugin';
import angularTemplateParser from '@angular-eslint/template-parser';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  // Base configuration for all files
  eslint.configs.recommended,
  prettier,
  // TypeScript configuration - only for .ts files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  // SonarJS recommended configuration - scoped to TypeScript files
  {
    files: ['**/*.ts'],
    ...sonarjs.configs.recommended,
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.app.json', './tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@angular-eslint': angularPlugin,
      import: importPlugin,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': 'allow-with-description',
          'ts-nocheck': 'allow-with-description',
          'ts-check': false,
        },
      ],

      // Import rules
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/no-duplicates': 'error',

      // General rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-duplicate-imports': 'off', // Handled by import/no-duplicates
      'prefer-const': 'error',
      'no-var': 'error',
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  // Angular-specific configuration for component files
  {
    files: ['src/app/**/*.ts'],
    plugins: {
      '@angular-eslint': angularPlugin,
    },
    rules: {
      ...angularPlugin.configs.recommended.rules,
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/no-empty-lifecycle-method': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/use-pipe-transform-interface': 'error',
    },
  },
  // Angular template files - parser setup for future template rules
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: angularTemplateParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@angular-eslint': angularPlugin,
    },
    rules: {
      // Template rules can be added here when needed
    },
  },
  // Server-specific configuration
  {
    files: ['src/server/**/*.ts'],
    rules: {
      'no-console': 'off', // Allow console in server code
      '@typescript-eslint/no-require-imports': 'off', // Allow require for server dependencies
    },
  },
  // Test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  // Config files - disable project-based rules for files outside tsconfig
  {
    files: ['*.config.{js,mjs,ts}', '*.config.*.{js,mjs,ts}', 'scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: null, // Disable project-based rules for config files
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'import/no-default-export': 'off',
    },
  },
  // Node.js files (worker.js)
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  // Spec/test files - disable project-based rules
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
  },
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.angular/**',
      'out-tsc/**',
      'coverage/**',
      '*.min.js',
      'public/**',
      '*.d.ts',
      '**/*.gen.ts',
      '**/*.gen.*',
      '.dev/worktree/**', // Ignore git worktree files
    ],
  },
);
