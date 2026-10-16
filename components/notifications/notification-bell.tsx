"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Bell,
  CheckCheck,
  Check,
  Clock,
  Ban,
  ShoppingCart,
  PackageCheck,
  FileText,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  BellOff,
  User,
  Sparkles,
  Phone,
  Mail,
  Car,
  ExternalLink,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsChecked,
  markNotificationAsUnchecked,
  markAllNotificationsAsChecked,
  type NotificationItem,
  type NotificationFilter,
  type NotificationRole,
} from "@/app/actions/notification-actions"
import { io as socketIO, type Socket } from "socket.io-client"

export function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    if (ctx.state === "suspended") {
      ctx.resume()
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    const now = ctx.currentTime
    // Pleasant two-tone chime (D5 -> A5)
    osc.frequency.setValueAtTime(587.33, now)
    osc.frequency.setValueAtTime(880, now + 0.12)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.35, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.45)
  } catch (_) {
    // Autoplay or audio context initialization blocked
  }
}

interface NotificationBellProps {
  deviceId?: number | null
  className?: string
  role?: NotificationRole
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  sideOffset?: number
  onNotificationClick?: (notification: NotificationItem) => void
  onUnreadCountChange?: (count: number) => void
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSeconds < 45) return "Just now"
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "Recently"
  }
}

export function NotificationBell({
  deviceId,
  className,
  role,
  side = "bottom",
  align = "end",
  sideOffset = 8,
  onNotificationClick,
  onUnreadCountChange,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all")
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedBulkIds, setExpandedBulkIds] = useState<Record<number, boolean>>({})
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const { toast } = useToast()

  // Fetch count
  const fetchCount = useCallback(async () => {
    if (!deviceId) return
    const res = await getUnreadNotificationCount(deviceId, role)
    if (res.success) {
      setUnreadCount(res.count)
      onUnreadCountChange?.(res.count)
    }
  }, [deviceId, role, onUnreadCountChange])

  // Fetch full notifications list for active tab
  const fetchNotificationsList = useCallback(
    async (filter = activeFilter) => {
      if (!deviceId) return
      setIsLoading(true)
      try {
        const res = await getNotifications(deviceId, filter, 50, role)
        if (res.success) {
          setNotifications(res.data)
          setUnreadCount(res.unreadCount)
          onUnreadCountChange?.(res.unreadCount)
        }
      } catch (err) {
        console.error("Failed to load notifications:", err)
      } finally {
        setIsLoading(false)
      }
    },
    [deviceId, activeFilter, role, onUnreadCountChange],
  )

  // Initial load
  useEffect(() => {
    if (deviceId) {
      fetchCount()
      if (isOpen) {
        fetchNotificationsList()
      }
    }
  }, [deviceId, isOpen, fetchCount, fetchNotificationsList])

  // Real-time Socket & SSE Setup
  useEffect(() => {
    if (!deviceId) return

    // 1. Kickstart socket server via API
    fetch("/api/notifications/socket").catch(() => {})

    const handleIncomingNotification = (newNotif: NotificationItem) => {
      // Role filtering:
      // Admin should never see or hear new_lead notifications
      if (role === "admin" && (newNotif.type === "new_lead" || newNotif.data?.targetRole === "staff")) {
        return
      }
      // Staff should never see purchase manager action notifications
      if (role === "staff" && (newNotif.type !== "new_lead" && newNotif.data?.targetRole !== "staff")) {
        return
      }

      setUnreadCount((prev) => {
        const next = prev + 1
        onUnreadCountChange?.(next)
        return next
      })

      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev
        return [newNotif, ...prev]
      })

      // Audio & toast alert for normal staff on new lead
      if (role === "staff" && newNotif.type === "new_lead") {
        playNotificationSound()
        try {
          window.dispatchEvent(new CustomEvent("crm:new-lead", { detail: newNotif }))
        } catch (_) {}

        const custName = newNotif.data?.customerName || newNotif.data?.name || "Customer"
        const phoneStr = newNotif.data?.phone ? ` (${newNotif.data.phone})` : ""
        const vehicleStr = newNotif.data?.vehicle ? ` • ${newNotif.data.vehicle}` : ""

        toast({
          title: "🔔 New CRM Lead Received!",
          description: `${custName}${phoneStr}${vehicleStr}`,
          action: onNotificationClick ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              onClick={() => onNotificationClick(newNotif)}
            >
              View Lead
            </Button>
          ) : undefined,
        })
      }
    }

    // 2. Connect to Socket.io server
    try {
      const socketHost = typeof window !== "undefined" ? window.location.hostname : "localhost"
      const socketPort = 3001
      const socketUrl = `${window.location.protocol}//${socketHost}:${socketPort}`

      const socket = socketIO(socketUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 10000,
      })

      socketRef.current = socket

      socket.on("connect", () => {
        setIsSocketConnected(true)
        socket.emit("join-device", deviceId)
      })

      socket.on("disconnect", () => {
        setIsSocketConnected(false)
      })

      socket.on("notification:new", (newNotif: NotificationItem) => {
        handleIncomingNotification(newNotif)
      })
    } catch (err) {
      console.warn("Socket initialization failed, falling back to SSE/polling:", err)
    }

    // 3. Fallback: SSE stream on port 3000
    try {
      const sse = new EventSource(`/api/notifications/stream?deviceId=${deviceId}`)
      eventSourceRef.current = sse

      sse.onmessage = (event) => {
        if (!event.data || event.data.startsWith(":")) return
        try {
          const newNotif = JSON.parse(event.data)
          handleIncomingNotification(newNotif)
        } catch (_) {}
      }
    } catch (_) {}

    // 4. Polling fallback (every 25 seconds)
    const pollInterval = setInterval(() => {
      fetchCount()
      if (isOpen) {
        fetchNotificationsList()
      }
    }, 25000)

    return () => {
      clearInterval(pollInterval)
      if (socketRef.current) {
        socketRef.current.emit("leave-device", deviceId)
        socketRef.current.disconnect()
        socketRef.current = null
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [deviceId, isOpen, role, fetchCount, fetchNotificationsList, onNotificationClick, onUnreadCountChange, toast])

  // Handle Mark All as Checked
  const handleMarkAllChecked = async () => {
    if (!deviceId) return
    const res = await markAllNotificationsAsChecked(deviceId, role)
    if (res.success) {
      setUnreadCount(0)
      onUnreadCountChange?.(0)
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          status: "checked",
          read_at: new Date().toISOString(),
        })),
      )
    }
  }

  // Handle Mark Single Checked/Unchecked
  const handleToggleCheck = async (e: React.MouseEvent, notif: NotificationItem) => {
    e.stopPropagation()
    if (!deviceId) return

    if (notif.status === "unchecked") {
      const res = await markNotificationAsChecked(notif.id, deviceId, role)
      if (res.success) {
        setUnreadCount(res.unreadCount)
        onUnreadCountChange?.(res.unreadCount)
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notif.id ? { ...n, status: "checked", read_at: new Date().toISOString() } : n,
          ),
        )
      }
    } else {
      const res = await markNotificationAsUnchecked(notif.id, deviceId, role)
      if (res.success) {
        setUnreadCount(res.unreadCount)
        onUnreadCountChange?.(res.unreadCount)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, status: "unchecked", read_at: null } : n)),
        )
      }
    }
  }

  // Toggle bulk items expanded view
  const toggleBulkExpand = (id: number) => {
    setExpandedBulkIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Filtered notifications
  const displayedNotifications = notifications.filter((notif) => {
    if (activeFilter === "unchecked") return notif.status === "unchecked"
    if (activeFilter === "checked") return notif.status === "checked"
    return true
  })

  // Action badge config
  const getActionBadge = (type: string) => {
    switch (type) {
      case "new_lead":
        return (
          <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 border-0 flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            New Lead
          </Badge>
        )
      case "order":
        return (
          <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-700 border-0 flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5">
            <ShoppingCart className="h-3 w-3" />
            Order
          </Badge>
        )
      case "postponed":
        return (
          <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border-0 flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5">
            <Clock className="h-3 w-3" />
            Postponed
          </Badge>
        )
      case "reject":
        return (
          <Badge className="bg-rose-100 hover:bg-rose-100 text-rose-700 border-0 flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5">
            <Ban className="h-3 w-3" />
            Rejected
          </Badge>
        )
      case "bulk_order":
        return (
          <Badge className="bg-purple-100 hover:bg-purple-100 text-purple-700 border-0 flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5">
            <PackageCheck className="h-3 w-3" />
            Bulk Order
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-0 text-[11px] px-2 py-0.5">
            {type}
          </Badge>
        )
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-9 w-9 rounded-full p-0 text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors",
            isOpen && "bg-blue-50 text-blue-600",
            className,
          )}
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className="w-[380px] sm:w-[460px] max-w-[95vw] p-0 rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden z-[100]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 leading-none">Notifications</h4>
            </div>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllChecked}
              className="h-8 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 rounded-lg flex items-center gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Filter Tabs: All, Unchecked, Checked */}
        <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/40 p-1 text-center text-xs font-medium">
          <button
            onClick={() => setActiveFilter("all")}
            className={cn(
              "py-1.5 rounded-lg transition-all font-semibold",
              activeFilter === "all"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter("unchecked")}
            className={cn(
              "py-1.5 rounded-lg transition-all font-semibold flex items-center justify-center gap-1.5",
              activeFilter === "unchecked"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            Unchecked
            {unreadCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter("checked")}
            className={cn(
              "py-1.5 rounded-lg transition-all font-semibold",
              activeFilter === "checked"
                ? "bg-white text-emerald-600 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            Checked
          </button>
        </div>

        {/* Notifications List */}
        <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
          {isLoading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-xs">Loading notifications...</p>
            </div>
          ) : displayedNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <BellOff className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No notifications found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                {activeFilter === "unchecked"
                  ? "You're all caught up! No unchecked notifications."
                  : activeFilter === "checked"
                  ? "No checked notifications."
                  : "No notifications to display."}
              </p>
            </div>
          ) : (
            displayedNotifications.map((notif) => {
              const isUnchecked = notif.status === "unchecked"
              const data = notif.data || {}
              const isBulk = notif.type === "bulk_order"
              const productsList: any[] = Array.isArray(data.products) ? data.products : []
              const isExpanded = Boolean(expandedBulkIds[notif.id])

              return (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (isUnchecked && deviceId) {
                      markNotificationAsChecked(notif.id, deviceId, role).then((res) => {
                        if (res.success) {
                          setUnreadCount(res.unreadCount)
                          onUnreadCountChange?.(res.unreadCount)
                          setNotifications((prev) =>
                            prev.map((n) =>
                              n.id === notif.id
                                ? { ...n, status: "checked", read_at: new Date().toISOString() }
                                : n,
                            ),
                          )
                        }
                      })
                    }
                    if (notif.type === "new_lead" && onNotificationClick) {
                      setIsOpen(false)
                      onNotificationClick(notif)
                    }
                  }}
                  className={cn(
                    "p-3.5 transition-colors cursor-pointer relative group",
                    isUnchecked
                      ? "bg-blue-50/30 hover:bg-blue-50/60"
                      : "bg-white hover:bg-slate-50",
                  )}
                >
                  {/* Top Bar: Action Badge + Date + Check Status Button */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {getActionBadge(notif.type)}
                      {isUnchecked && (
                        <span className="flex h-2 w-2 rounded-full bg-blue-600 ring-4 ring-blue-100" />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                        {formatRelativeTime(notif.created_at)}
                      </span>

                      <button
                        onClick={(e) => handleToggleCheck(e, notif)}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
                          isUnchecked
                            ? "text-slate-300 hover:text-blue-600 hover:bg-blue-100/60"
                            : "text-emerald-600 hover:bg-emerald-50",
                        )}
                        title={isUnchecked ? "Mark as checked" : "Mark as unchecked"}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Primary Info */}
                  <h5 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">
                    {notif.title}
                  </h5>

                  {/* CRM New Lead Details Section */}
                  {notif.type === "new_lead" && (
                    <div className="mt-2 rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-sm">
                          {data.customerName || data.name || notif.title}
                        </span>
                        {data.leadNumber && (
                          <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 font-semibold">
                            {data.leadNumber}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        {data.phone && (
                          <a
                            href={`tel:${data.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                          >
                            <Phone className="h-3 w-3 text-emerald-600" />
                            {data.phone}
                          </a>
                        )}
                        {data.email && (
                          <a
                            href={`mailto:${data.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-slate-500 hover:text-emerald-700 hover:underline"
                          >
                            <Mail className="h-3 w-3 text-emerald-600" />
                            {data.email}
                          </a>
                        )}
                      </div>

                      {(data.vehicle || data.year) && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-700 font-medium">
                          <Car className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                          <span>
                            {data.vehicle} {data.year ? `(${data.year})` : ""}
                          </span>
                        </div>
                      )}

                      {(data.campaign || data.source) && (
                        <div className="text-[10px] text-slate-400">
                          Source: {data.source || "External"} {data.campaign ? `• Campaign: ${data.campaign}` : ""}
                        </div>
                      )}

                      {data.message && (
                        <p className="text-[11px] text-slate-600 italic bg-white/70 p-1.5 rounded border border-emerald-100/70">
                          &ldquo;{data.message}&rdquo;
                        </p>
                      )}

                      {onNotificationClick && (
                        <div className="pt-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isUnchecked && deviceId) {
                                markNotificationAsChecked(notif.id, deviceId, role)
                              }
                              setIsOpen(false)
                              onNotificationClick(notif)
                            }}
                          >
                            <span>Open in CRM Leads</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product Details Section */}
                  {notif.type !== "new_lead" && !isBulk && productsList.length > 0 && (
                    <div className="mt-2 rounded-lg bg-slate-50/80 border border-slate-100 p-2.5 text-xs space-y-1">
                      {productsList.map((prod, idx) => (
                        <div key={idx} className="space-y-0.5">
                          <div className="font-semibold text-slate-800">
                            {prod.productName}
                            {prod.variantName && (
                              <span className="text-slate-500 font-normal ml-1">
                                ({prod.variantName})
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                            {prod.sku && <span>SKU: {prod.sku}</span>}
                            {prod.requiredQty != null && (
                              <span className="font-medium text-slate-700">
                                Required: {prod.requiredQty}
                              </span>
                            )}
                            {prod.currentStock != null && (
                              <span>Stock: {prod.currentStock}</span>
                            )}
                            {prod.price != null && Number(prod.price) > 0 && (
                              <span>Price: {prod.price}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bulk Products Section */}
                  {isBulk && (
                    <div className="mt-2 rounded-lg bg-purple-50/50 border border-purple-100/80 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-purple-900 flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-purple-600" />
                          {productsList.length} products included in bulk order
                        </span>
                        {productsList.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBulkExpand(notif.id)
                            }}
                            className="text-[11px] font-semibold text-purple-700 hover:text-purple-800 flex items-center gap-0.5 hover:underline"
                          >
                            {isExpanded ? "Hide Details" : "View Details"}
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expandable Bulk Items Table */}
                      {isExpanded && productsList.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-purple-100 max-h-48 overflow-y-auto space-y-1.5">
                          {productsList.map((item, idx) => (
                            <div
                              key={idx}
                              className="rounded bg-white/80 p-1.5 text-[11px] border border-purple-100/50"
                            >
                              <div className="font-medium text-slate-800">
                                {idx + 1}. {item.productName}
                                {item.variantName && (
                                  <span className="text-slate-500 font-normal ml-1">
                                    ({item.variantName})
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-500 mt-0.5">
                                {item.sku && <span>SKU: {item.sku}</span>}
                                {item.requiredQty != null && (
                                  <span className="font-semibold text-purple-800">
                                    Qty: {item.requiredQty}
                                  </span>
                                )}
                                {item.currentStock != null && (
                                  <span>Stock: {item.currentStock}</span>
                                )}
                                {item.price != null && Number(item.price) > 0 && (
                                  <span>Price: {item.price}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Internal Notes Callout Box (Only if note exists) */}
                  {notif.internal_note && (
                    <div className="mt-2 rounded-lg bg-amber-50/90 border border-amber-200/70 p-2.5 text-xs text-amber-900">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-0.5">
                        <FileText className="h-3.5 w-3.5 text-amber-700 flex-shrink-0" />
                        <span>Note:</span>
                      </div>
                      <p className="whitespace-pre-wrap pl-5 text-amber-950 font-normal leading-relaxed text-[11px]">
                        {notif.internal_note}
                      </p>
                    </div>
                  )}

                  {/* Footer / Staff Attributed */}
                  {(notif.created_by_staff_name || data.staffName) && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                      <User className="h-3 w-3" />
                      <span>By: {notif.created_by_staff_name || data.staffName}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
export default NotificationBell
