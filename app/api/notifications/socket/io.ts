import type { NextApiRequest } from "next"
import type { Server as NetServer } from "http"
import type { Socket as NetSocket } from "net"
import { Server as ServerIO } from "socket.io"

interface SocketServer extends NetServer {
  io?: ServerIO
}

interface SocketWithIO extends NetSocket {
  server: SocketServer
}

interface NextApiResponseWithSocket {
  socket: SocketWithIO
  end: () => void
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (!res.socket.server.io) {
    console.log("[Socket.io] Initializing Socket.io server on HTTP server...")
    const httpServer: NetServer = res.socket.server

    const io = new ServerIO(httpServer, {
      path: "/api/notifications/socket/io",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
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

      socket.on("broadcast-notification", (data: { deviceId: number | string; notification: any }) => {
        if (!data?.deviceId || !data?.notification) return
        const room = `device_${data.deviceId}`
        socket.to(room).emit("notification:new", data.notification)
      })
    })

    res.socket.server.io = io
    ;(globalThis as any).io = io
  }

  res.end()
}
