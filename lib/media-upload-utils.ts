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
  const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif)$/i.test(file.name)
  if (!isImage || file.type === "image/svg+xml") return file

  const maxDimension = options?.maxDimension ?? 1800
  const skipIfUnderBytes = options?.skipIfUnderBytes ?? 1.5 * 1024 * 1024
  const preferredMime = options?.preferredMime

  // Keep already lightweight JPEGs/WebPs unchanged to avoid unnecessary canvas work
  if (file.size <= skipIfUnderBytes && (file.type === "image/jpeg" || file.type === "image/webp")) {
    return file
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const maxOriginal = Math.max(bitmap.width, bitmap.height)
    const scale = maxOriginal > maxDimension ? maxDimension / maxOriginal : 1
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

    // Fast pass at 0.82 quality - produces crystal-clear output with minimal bytes
    const fastBlob = await canvasToBlob(canvas, targetMime, 0.82)
    if (fastBlob && fastBlob.size <= MAX_IMAGE_SIZE_BYTES) {
      return new File([fastBlob], toFileName(file.name, targetMime), {
        type: targetMime,
        lastModified: Date.now(),
      })
    }

    // Secondary fallback pass if still over limit
    if (fastBlob && fastBlob.size > MAX_IMAGE_SIZE_BYTES) {
      const fallbackBlob = await canvasToBlob(canvas, targetMime, 0.65)
      if (fallbackBlob && fallbackBlob.size <= MAX_IMAGE_SIZE_BYTES) {
        return new File([fallbackBlob], toFileName(file.name, targetMime), {
          type: targetMime,
          lastModified: Date.now(),
        })
      }
    }

    if (fastBlob && fastBlob.size < file.size) {
      return new File([fastBlob], toFileName(file.name, targetMime), {
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
