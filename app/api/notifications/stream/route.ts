import { NextRequest } from "next/server"
import { registerSSEClient, initSocketServer } from "@/lib/socket-server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // Ensure socket server is also booted
  initSocketServer()

  const { searchParams } = new URL(req.url)
  const deviceId = Number(searchParams.get("deviceId"))

  if (!deviceId || isNaN(deviceId)) {
    return new Response("Invalid deviceId", { status: 400 })
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Send initial keep-alive comment
      controller.enqueue(encoder.encode(": connected\n\n"))

      const unregister = registerSSEClient(deviceId, (notification) => {
        try {
          const payload = `data: ${JSON.stringify(notification)}\n\n`
          controller.enqueue(encoder.encode(payload))
        } catch (_) {}
      })

      // Send ping every 25 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch (_) {
          clearInterval(pingInterval)
        }
      }, 25000)

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval)
        unregister()
        try {
          controller.close()
        } catch (_) {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
