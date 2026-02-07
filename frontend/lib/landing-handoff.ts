export const LANDING_MESSAGE_STORAGE_KEY = "confidential-chat-landing-message-v1"
export const LANDING_FILES_STORAGE_KEY = "confidential-chat-landing-files-v1"

export type LandingUploadedFile = {
  name: string
  content: string
  size: number
  type: string
}

export function parseLandingUploadedFiles(raw: string | null): LandingUploadedFile[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is LandingUploadedFile => {
        return (
          item &&
          typeof item === "object" &&
          typeof item.name === "string" &&
          typeof item.content === "string" &&
          typeof item.size === "number" &&
          Number.isFinite(item.size) &&
          typeof item.type === "string"
        )
      })
      .map((file) => ({
        name: file.name,
        content: file.content,
        size: file.size,
        type: file.type,
      }))
  } catch {
    return []
  }
}
