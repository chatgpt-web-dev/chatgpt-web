module.exports = {
  root: true,
  extends: ['@antfu'],
  rules: {
    'antfu/top-level-function': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@stylistic/ts/member-delimiter-style': 'off',
    '@stylistic/ts/indent': 'off',
    '@stylistic/js/no-tabs': 'off',
    'vue/no-unused-refs': 'off',
    'import/newline-after-import': 'off',
    'unicorn/prefer-number-properties': 'off',
  },
  ignorePatterns: [
    'vite.config.ts',
    'tsconfig.json',
  ],
}
