import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024

interface ClientTokenRequestBody {
  pathname?: string
  contentType?: string
  type?: "image" | "video"
}

export async function POST(request: Request): Promise<Response> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      return Response.json({ error: "Blob token is not configured on server." }, { status: 500 })
    }

    const body = (await request.json()) as ClientTokenRequestBody
    const pathname = typeof body.pathname === "string" ? body.pathname : ""
    const contentType = typeof body.contentType === "string" ? body.contentType : ""
    const type = body.type === "video" ? "video" : "image"

    if (!pathname) {
      return Response.json({ error: "Pathname is required." }, { status: 400 })
    }

    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      addRandomSuffix: true,
      validUntil: Date.now() + 15 * 60 * 1000, // 15 minutes to allow slow connections to complete without 30s timeout
      maximumSizeInBytes: type === "video" ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES,
      allowedContentTypes: type === "video" ? ["video/*"] : ["image/*"],
    })

    return Response.json({ clientToken })
  } catch (error) {
    console.error("Blob client token generation error:", error)
    const message = error instanceof Error ? error.message : "Failed to generate client token."
    return Response.json({ error: message }, { status: 400 })
  }
}
