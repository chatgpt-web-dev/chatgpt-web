module.exports = {
  root: true,
  extends: ['@antfu'],
  rules: {
    'antfu/top-level-function': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    'vue/no-unused-refs': 'off',
    'unicorn/prefer-number-properties': 'off',
  },
  ignorePatterns: [
    'vite.config.ts',
    'tsconfig.json',
  ],
}
