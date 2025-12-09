module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'vue', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    // TypeScript - Moderate strictness
    '@typescript-eslint/no-explicit-any': 'warn', // Warn but don't block
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // Vue 3 - Moderate rules
    'vue/multi-word-component-names': 'off',
    'vue/require-default-prop': 'warn',
    'vue/require-prop-types': 'warn',
    'vue/no-v-html': 'warn',
    'vue/component-tags-order': [
      'warn',
      {
        order: ['template', 'script', 'style'],
      },
    ],

    // General best practices
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
    'prefer-const': 'warn',
    'no-var': 'error',

    // Prettier integration
    'prettier/prettier': 'warn',
  },
  overrides: [
    {
      // Main process (Node.js/Electron)
      files: ['packages/main/**/*.ts'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        'no-console': 'off', // Allow console in main process
      },
    },
    {
      // Preload scripts
      files: ['packages/preload/**/*.ts'],
      env: {
        node: true,
      },
    },
    {
      // Renderer process (Vue 3/Browser)
      files: ['packages/renderer/**/*.{ts,vue}'],
      env: {
        browser: true,
        node: false,
      },
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    {
      // Test files - More relaxed rules
      files: [
        '**/__tests__/**/*.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**/*.vue.ts',
        '**/*.test.vue.ts',
        '**/*.spec.vue.ts',
      ],
      env: {
        node: true,
      },
      globals: {
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        test: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests
        'no-console': 'off',
      },
    },
    {
      // Build scripts
      files: ['scripts/**/*.js', '*.js'],
      env: {
        node: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
}
