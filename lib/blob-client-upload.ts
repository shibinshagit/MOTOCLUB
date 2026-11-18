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

  // 2. Put file to Blob with abort timeout and progress tracking
  const uploadAbort = new AbortController()
  const uploadTimeoutMs = type === "video" ? 300000 : 90000 // 5m for video, 90s for image
  const uploadTimeout = setTimeout(() => uploadAbort.abort(), uploadTimeoutMs)

  try {
    const result = await put(basePath, file, {
      access: "public",
      token: clientToken,
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      abortSignal: uploadAbort.signal,
      onUploadProgress: (progress) => {
        if (onProgress) {
          onProgress(progress)
        }
      },
    })

    if (!result || !result.url) {
      throw new Error("File upload succeeded but no URL was returned")
    }

    return result.url
  } catch (err: any) {
    if (uploadAbort.signal.aborted) {
      throw new Error(
        `Upload timed out after ${uploadTimeoutMs / 1000} seconds. Please check your network connection or try a smaller file.`
      )
    }
    throw err
  } finally {
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

  const uploadAbort = new AbortController()
  const uploadTimeoutMs = type === "video" ? 300000 : 90000
  const uploadTimeout = setTimeout(() => uploadAbort.abort(), uploadTimeoutMs)

  try {
    const result = await put(basePath, file, {
      access: "public",
      token: clientToken,
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      abortSignal: uploadAbort.signal,
      onUploadProgress: (progress) => {
        if (onProgress) {
          onProgress(progress)
        }
      },
    })

    if (!result || !result.url) {
      throw new Error("File upload succeeded but no URL was returned")
    }

    return result.url
  } catch (err: any) {
    if (uploadAbort.signal.aborted) {
      throw new Error(
        `Upload timed out after ${uploadTimeoutMs / 1000} seconds. Please check your network connection or try a smaller file.`
      )
    }
    throw err
  } finally {
    clearTimeout(uploadTimeout)
  }
}

