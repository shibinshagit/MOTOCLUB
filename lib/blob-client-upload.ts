"use client"

import { put } from "@vercel/blob/client"

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

export async function uploadProductFileFromClient(
  file: File,
  productName: string,
  type: "image" | "video",
): Promise<string> {
  const timestamp = Date.now()
  const safeProductName = sanitizeName(productName || "product").slice(0, 50)
  const safeFileName = sanitizeName(file.name)
  const basePath =
    type === "video"
      ? `products/videos/${timestamp}-${safeProductName}-${safeFileName}`
      : `products/${timestamp}-${safeProductName}-${safeFileName}`

  try {
    const response = await fetch("/api/blob/client-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: basePath,
        contentType: file.type,
        type,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      console.warn("Vercel Blob client token unavailable, falling back to data URL:", payload?.error)
      return await fileToDataURL(file)
    }

    const { clientToken } = (await response.json()) as { clientToken?: string }
    if (!clientToken) {
      return await fileToDataURL(file)
    }

    const result = await put(basePath, file, {
      access: "public",
      token: clientToken,
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
    })

    return result.url
  } catch (error) {
    console.warn("Vercel Blob upload failed, using data URL fallback:", error)
    return await fileToDataURL(file)
  }
}

