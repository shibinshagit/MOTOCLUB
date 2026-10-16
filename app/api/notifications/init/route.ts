import { NextResponse } from "next/server"
import { initSocketServer } from "@/lib/socket-server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    initSocketServer()
    return NextResponse.json({ success: true, message: "Socket server initialized" })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to initialize" }, { status: 500 })
  }
}
