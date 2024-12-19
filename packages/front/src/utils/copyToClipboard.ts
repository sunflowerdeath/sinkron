const copyToClipboard = (text: string) => navigator.clipboard?.writeText(text)

export { copyToClipboard }
