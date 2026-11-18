"use client"

import { put } from "@vercel/blob/client"

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

export type UploadProgressCallback = (progress: {
  percentage: number
  loaded: number
  total: number
}) => void

export async function uploadProductFileFromClient(
  file: File,
  productName: string,
  type: "image" | "video",
  onProgress?: UploadProgressCallback,
): Promise<string> {
  const timestamp = Date.now()
  const safeProductName = sanitizeName(productName || "product").slice(0, 50)
  const safeFileName = sanitizeName(file.name)
  const basePath =
    type === "video"
      ? `products/videos/${timestamp}-${safeProductName}-${safeFileName}`
      : `products/${timestamp}-${safeProductName}-${safeFileName}`

  // Notify initial progress
  onProgress?.({ percentage: 10, loaded: Math.round(file.size * 0.1), total: file.size })

  // 1. Fetch client token with timeout to prevent hanging
  const tokenAbort = new AbortController()
  const tokenTimeout = setTimeout(() => tokenAbort.abort(), 20000)

  let response: Response
  try {
    response = await fetch("/api/blob/client-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: basePath,
        contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
        type,
      }),
      signal: tokenAbort.signal,
    })
  } catch (err: any) {
    if (tokenAbort.signal.aborted) {
      throw new Error("Upload authorization request timed out. Please check your internet connection.")
    }
    throw err
  } finally {
    clearTimeout(tokenTimeout)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const errorMessage = payload?.error || `Upload authorization failed (${response.status})`
    throw new Error(errorMessage)
  }

  const { clientToken } = (await response.json()) as { clientToken?: string }
  if (!clientToken) {
    throw new Error("Blob client token was not returned by server")
  }

  onProgress?.({ percentage: 25, loaded: Math.round(file.size * 0.25), total: file.size })

  // 2. Put file to Blob with abort timeout
  // NOTE: We deliberately do NOT pass onUploadProgress to put().
  // In @vercel/blob/client, passing onUploadProgress triggers fetch({ duplex: 'half', body: TransformStream })
  // which causes chunked streaming without Content-Length, deadlocking at 94% on Chrome + AWS S3 / Vercel Edge.
  // Passing the raw File without onUploadProgress allows native browser PUT with Content-Length, uploading instantly.
  const uploadAbort = new AbortController()
  const uploadTimeoutMs = type === "video" ? 300000 : 90000 // 5m for video, 90s for image
  const uploadTimeout = setTimeout(() => uploadAbort.abort(), uploadTimeoutMs)

  let currentSimulatedPct = 25
  const progressTicker = setInterval(() => {
    if (currentSimulatedPct < 90) {
      currentSimulatedPct += Math.max(1, Math.round((92 - currentSimulatedPct) * 0.2))
      onProgress?.({
        percentage: currentSimulatedPct,
        loaded: Math.round(file.size * (currentSimulatedPct / 100)),
        total: file.size,
      })
    }
  }, 250)

  try {
    const result = await put(basePath, file, {
      access: "public",
      token: clientToken,
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      abortSignal: uploadAbort.signal,
    })

    if (result?.url) {
      clearInterval(progressTicker)
      onProgress?.({ percentage: 100, loaded: file.size, total: file.size })
      return result.url
    }
    throw new Error("File upload succeeded but no URL was returned")
  } catch (err: any) {
    clearInterval(progressTicker)

    // If direct client-to-blob upload fails or stalls and file is within server payload limits (<4.5MB),
    // attempt automatic fallback to server-side upload.
    if (file.size <= 4.5 * 1024 * 1024) {
      console.warn("Direct blob upload failed, attempting server upload fallback:", err)
      try {
        const fallbackFormData = new FormData()
        fallbackFormData.append("file", file)
        fallbackFormData.append("pathname", basePath)

        const fallbackResponse = await fetch("/api/blob/upload", {
          method: "POST",
          body: fallbackFormData,
        })

        if (fallbackResponse.ok) {
          const payload = (await fallbackResponse.json().catch(() => ({}))) as { url?: string }
          if (payload?.url) {
            onProgress?.({ percentage: 100, loaded: file.size, total: file.size })
            return payload.url
          }
        }
      } catch (fallbackErr) {
        console.error("Server upload fallback also failed:", fallbackErr)
      }
    }

    if (uploadAbort.signal.aborted) {
      throw new Error(
        `Upload timed out after ${uploadTimeoutMs / 1000} seconds. Please check your network connection or try a smaller file.`
      )
    }
    throw err
  } finally {
    clearInterval(progressTicker)
    clearTimeout(uploadTimeout)
  }
}

export async function uploadReviewFileFromClient(
  file: File,
  saleId: number | string,
  type: "image" | "video",
  onProgress?: UploadProgressCallback,
): Promise<string> {
  const timestamp = Date.now()
  const safeFileName = sanitizeName(file.name)
  const basePath =
    type === "video"
      ? `reviews/videos/${saleId}-${timestamp}-${safeFileName}`
      : `reviews/${saleId}-${timestamp}-${safeFileName}`

  onProgress?.({ percentage: 10, loaded: Math.round(file.size * 0.1), total: file.size })

  const tokenAbort = new AbortController()
  const tokenTimeout = setTimeout(() => tokenAbort.abort(), 20000)

  let response: Response
  try {
    response = await fetch("/api/blob/client-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: basePath,
        contentType: file.type || (type === "video" ? "video/mp4" : "image/jpeg"),
        type,
      }),
      signal: tokenAbort.signal,
    })
  } catch (err: any) {
    if (tokenAbort.signal.aborted) {
      throw new Error("Upload authorization request timed out. Please check your internet connection.")
    }
    throw err
  } finally {
    clearTimeout(tokenTimeout)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const errorMessage = payload?.error || `Upload authorization failed (${response.status})`
    throw new Error(errorMessage)
  }

  const { clientToken } = (await response.json()) as { clientToken?: string }
  if (!clientToken) {
    throw new Error("Blob client token was not returned by server")
  }

  onProgress?.({ percentage: 25, loaded: Math.round(file.size * 0.25), total: file.size })

  const uploadAbort = new AbortController()
  const uploadTimeoutMs = type === "video" ? 300000 : 90000
  const uploadTimeout = setTimeout(() => uploadAbort.abort(), uploadTimeoutMs)

  let currentSimulatedPct = 25
  const progressTicker = setInterval(() => {
    if (currentSimulatedPct < 90) {
      currentSimulatedPct += Math.max(1, Math.round((92 - currentSimulatedPct) * 0.2))
      onProgress?.({
        percentage: currentSimulatedPct,
        loaded: Math.round(file.size * (currentSimulatedPct / 100)),
        total: file.size,
      })
    }
  }, 250)

  try {
    const result = await put(basePath, file, {
      access: "public",
      token: clientToken,
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      abortSignal: uploadAbort.signal,
    })

    if (result?.url) {
      clearInterval(progressTicker)
      onProgress?.({ percentage: 100, loaded: file.size, total: file.size })
      return result.url
    }
    throw new Error("File upload succeeded but no URL was returned")
  } catch (err: any) {
    clearInterval(progressTicker)

    if (file.size <= 4.5 * 1024 * 1024) {
      console.warn("Direct blob upload failed, attempting server upload fallback:", err)
      try {
        const fallbackFormData = new FormData()
        fallbackFormData.append("file", file)
        fallbackFormData.append("pathname", basePath)

        const fallbackResponse = await fetch("/api/blob/upload", {
          method: "POST",
          body: fallbackFormData,
        })

        if (fallbackResponse.ok) {
          const payload = (await fallbackResponse.json().catch(() => ({}))) as { url?: string }
          if (payload?.url) {
            onProgress?.({ percentage: 100, loaded: file.size, total: file.size })
            return payload.url
          }
        }
      } catch (fallbackErr) {
        console.error("Server upload fallback also failed:", fallbackErr)
      }
    }

    if (uploadAbort.signal.aborted) {
      throw new Error(
        `Upload timed out after ${uploadTimeoutMs / 1000} seconds. Please check your network connection or try a smaller file.`
      )
    }
    throw err
  } finally {
    clearInterval(progressTicker)
    clearTimeout(uploadTimeout)
  }
}
