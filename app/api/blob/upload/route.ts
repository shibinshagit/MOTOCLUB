import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      return Response.json({ error: "Blob token is not configured on server." }, { status: 500 })
    }

    const jsonResponse = await handleUpload({
      token,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const lowerPath = pathname.toLowerCase()
        const isVideo = lowerPath.includes("/videos/")
        return {
          allowedContentTypes: isVideo ? ["video/*"] : ["image/*"],
          maximumSizeInBytes: isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // No-op: product URLs are persisted through product actions.
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    console.error("Blob client upload token error:", error)
    const message = error instanceof Error ? error.message : "Failed to handle upload request"
    return Response.json({ error: message }, { status: 400 })
  }
}
