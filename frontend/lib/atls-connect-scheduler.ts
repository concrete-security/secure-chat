export function scheduleAtlsAutoConnect(connect: () => void): () => void {
  const timeoutId = setTimeout(connect, 0)
  return () => clearTimeout(timeoutId)
}
