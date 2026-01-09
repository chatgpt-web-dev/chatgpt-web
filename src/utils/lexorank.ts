const rankChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const rankMin = rankChars[0]

export function rankBetween(lower?: string | null, upper?: string | null) {
  const low = lower ?? ''
  const high = upper ?? ''
  let prefix = ''
  let i = 0
  while (true) {
    const lowChar = i < low.length ? low[i] : null
    const highChar = i < high.length ? high[i] : null
    const lowIndex = lowChar ? rankChars.indexOf(lowChar) : 0
    const highIndex = highChar ? rankChars.indexOf(highChar) : rankChars.length - 1
    if (highIndex - lowIndex > 1) {
      const mid = Math.floor((lowIndex + highIndex) / 2)
      return `${prefix}${rankChars[mid]}`
    }
    if (lowChar)
      prefix += lowChar
    else
      prefix += rankMin
    i += 1
  }
}

export function compareRank(a?: string | null, b?: string | null) {
  const left = a ?? ''
  const right = b ?? ''
  const maxLen = Math.max(left.length, right.length)
  for (let i = 0; i < maxLen; i++) {
    const leftChar = i < left.length ? left[i] : null
    const rightChar = i < right.length ? right[i] : null
    if (leftChar === rightChar)
      continue
    if (leftChar === null)
      return -1
    if (rightChar === null)
      return 1
    const leftIndex = rankChars.indexOf(leftChar)
    const rightIndex = rankChars.indexOf(rightChar)
    if (leftIndex === rightIndex)
      continue
    return leftIndex < rightIndex ? -1 : 1
  }
  return 0
}
