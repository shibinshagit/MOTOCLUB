"use client"

import { put } from "@vercel/blob/client"

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
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
    throw new Error(payload?.error || "Failed to generate upload token")
  }

  const { clientToken } = (await response.json()) as { clientToken?: string }
  if (!clientToken) {
    throw new Error("Upload token was not returned")
  }

  const result = await put(basePath, file, {
    access: "public",
    token: clientToken,
    contentType: file.type || undefined,
    multipart: file.size > 20 * 1024 * 1024,
  })

  return result.url
}
