document.addEventListener('copy', (e) => {
  const selectedText = window.getSelection()?.toString() ?? ''
  const cleanedText = selectedText?.replace(/\n+$/, '\n')
  e.clipboardData?.setData('text/plain', cleanedText)

  e.preventDefault()
})

export async function copyToClip(text: string) {
  // https://stackoverflow.com/questions/51805395/navigator-clipboard-is-undefined
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
  }
  else {
    const input: HTMLTextAreaElement = document.createElement('textarea')
    input.setAttribute('readonly', 'readonly')
    input.value = text
    document.body.appendChild(input)
    input.select()
    if (document.execCommand('copy'))
      document.execCommand('copy')
    document.body.removeChild(input)
  }
}
