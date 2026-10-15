import { createServer } from "http"
import { Server as ServerIO } from "socket.io"

type SSECallback = (data: any) => void
const sseClients = new Map<number, Set<SSECallback>>()

export function registerSSEClient(deviceId: number, cb: SSECallback): () => void {
  if (!sseClients.has(deviceId)) {
    sseClients.set(deviceId, new Set())
  }
  sseClients.get(deviceId)!.add(cb)

  return () => {
    const clients = sseClients.get(deviceId)
    if (clients) {
      clients.delete(cb)
      if (clients.size === 0) {
        sseClients.delete(deviceId)
      }
    }
  }
}

export function initSocketServer(): ServerIO | null {
  if (typeof window !== "undefined") return null

  if ((globalThis as any).__socketIoServer) {
    return (globalThis as any).__socketIoServer as ServerIO
  }

  const socketPort = Number(process.env.SOCKET_PORT) || 3001

  try {
    const httpServer = createServer((_req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok", service: "motoclub-socket-server", port: socketPort }))
    })

    const io = new ServerIO(httpServer, {
      path: "/socket.io",
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    })

    io.on("connection", (socket) => {
      socket.on("join-device", (deviceId: number | string) => {
        if (!deviceId) return
        const room = `device_${deviceId}`
        socket.join(room)
      })

      socket.on("leave-device", (deviceId: number | string) => {
        if (!deviceId) return
        const room = `device_${deviceId}`
        socket.leave(room)
      })

      socket.on("broadcast-notification", (payload: { deviceId: number | string; notification: any }) => {
        if (!payload?.deviceId || !payload?.notification) return
        const room = `device_${payload.deviceId}`
        socket.to(room).emit("notification:new", payload.notification)
      })
    })

    httpServer.listen(socketPort, () => {
      console.log(`[Socket.io] Realtime notification server listening on port ${socketPort}`)
    })

    httpServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[Socket.io] Port ${socketPort} already in use, attaching to existing instance`)
      } else {
        console.error("[Socket.io] Error starting server:", err)
      }
    })

    ;(globalThis as any).__socketIoServer = io
    return io
  } catch (error) {
    console.error("[Socket.io] Failed to initialize socket server:", error)
    return null
  }
}

export function emitNotificationToDevice(deviceId: number, notification: any) {
  // 1. Emit via Socket.io
  try {
    const io = (globalThis as any).__socketIoServer || initSocketServer()
    if (io) {
      const room = `device_${deviceId}`
      io.to(room).emit("notification:new", notification)
    }
  } catch (err) {
    console.error("[Socket.io] Error emitting notification:", err)
  }

  // 2. Emit to any active SSE subscribers
  try {
    const clients = sseClients.get(deviceId)
    if (clients && clients.size > 0) {
      clients.forEach((cb) => {
        try {
          cb(notification)
        } catch (_) {}
      })
    }
  } catch (err) {
    console.error("[SSE] Error emitting to SSE clients:", err)
  }
}
