document.addEventListener('copy', (e) => {
  const selectedText = window.getSelection()?.toString() ?? ''
  const cleanedText = selectedText?.replace(/\n+$/, '\n')
  e.clipboardData?.setData('text/plain', cleanedText)

  e.preventDefault()
})

export function copyToClip(text: string) {
  return navigator.clipboard.writeText(text)
}
