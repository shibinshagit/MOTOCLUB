export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024
export const MAX_TOTAL_MEDIA_PAYLOAD_BYTES = 95 * 1024 * 1024

type CompressImageOptions = {
  maxDimension?: number
  skipIfUnderBytes?: number
  preferredMime?: "image/jpeg" | "image/webp"
}

function toFileName(name: string, mimeType: string) {
  const base = name.replace(/\.[^/.]+$/, "")
  if (mimeType === "image/webp") return `${base}.webp`
  if (mimeType === "image/jpeg") return `${base}.jpg`
  return name
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function compressImageForUpload(file: File, options?: CompressImageOptions): Promise<File> {
  if (typeof window === "undefined") return file
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file

  const maxDimension = options?.maxDimension ?? 2200
  const skipIfUnderBytes = options?.skipIfUnderBytes ?? 2 * 1024 * 1024
  const preferredMime = options?.preferredMime

  // Keep small files unchanged unless caller opts into a lower threshold.
  if (file.size <= skipIfUnderBytes) return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    ctx.drawImage(bitmap, 0, 0, width, height)

    const targetMime =
      file.type === "image/jpeg" || file.type === "image/webp"
        ? file.type
        : preferredMime || "image/jpeg"
    const qualitySteps = [0.88, 0.8, 0.72, 0.64, 0.56]

    let bestBlob: Blob | null = null
    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, targetMime, quality)
      if (!blob) continue
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob
      if (blob.size <= MAX_IMAGE_SIZE_BYTES) {
        return new File([blob], toFileName(file.name, targetMime), {
          type: targetMime,
          lastModified: Date.now(),
        })
      }
    }

    if (bestBlob && bestBlob.size < file.size) {
      return new File([bestBlob], toFileName(file.name, targetMime), {
        type: targetMime,
        lastModified: Date.now(),
      })
    }
    return file
  } catch {
    return file
  } finally {
    if (bitmap) bitmap.close()
  }
}

export async function compressBrandingLogoForUpload(file: File): Promise<File> {
  return compressImageForUpload(file, {
    maxDimension: 1200,
    skipIfUnderBytes: 120 * 1024,
    preferredMime: "image/webp",
  })
}

export async function compressBrandingIconForUpload(file: File): Promise<File> {
  return compressImageForUpload(file, {
    maxDimension: 512,
    skipIfUnderBytes: 80 * 1024,
    preferredMime: "image/webp",
  })
}
