import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'service/*',
    '*.md',
    '*.json',
  ],
})
