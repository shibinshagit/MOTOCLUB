import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) {
      return NextResponse.json({ error: "Blob token is not configured on server." }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const pathname = formData.get("pathname") as string | null

    if (!file || !pathname) {
      return NextResponse.json({ error: "Missing file or pathname." }, { status: 400 })
    }

    const blob = await put(pathname, file, {
      access: "public",
      token,
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("Server-side Blob upload error:", error)
    const message = error instanceof Error ? error.message : "Failed to upload file to Blob storage."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

