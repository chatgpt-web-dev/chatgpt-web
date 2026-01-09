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
