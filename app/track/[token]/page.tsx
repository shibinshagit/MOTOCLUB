"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Check,
  Package,
  ExternalLink,
  Loader2,
  Search,
  MapPin,
  Truck,
  CheckCircle2,
  Clock,
  Copy,
  CheckCheck,
  User,
  Navigation,
  Store,
  ArrowRight,
} from "lucide-react"

type TimelineEvent = {
  status: string
  title: string
  activity?: string
  date: string
  location?: string
  courierName?: string
}

type OrderItem = {
  name: string
  quantity: number
  price?: string | null
}

type TrackingData = {
  orderId: string
  deliveryStatus: string
  trackingId: string
  courierPartnerName: string
  courierServiceName: string
  courierTrackingUrl: string | null
  currentLocation: string
  destination: string
  origin?: string | null
  expectedDelivery?: string | null
  additionalInfo?: string | null
  customerName?: string
  contact?: string
  totalAmount?: string | null
  paymentStatus?: string | null
  paymentMethod?: string | null
  items?: OrderItem[]
  lastUpdate: string
  timeline: TimelineEvent[]
}

export default function CustomerTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const token = (params?.token as string) || ""

  const [searchInput, setSearchInput] = useState(token)
  const [data, setData] = useState<TrackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!token) return

    const fetchTracking = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/track/${encodeURIComponent(token)}`)
        const json = await res.json()
        if (json.success && json.data) {
          setData(json.data)
        } else {
          setError(json.message || "Shipment tracking details not found")
        }
      } catch (err) {
        setError("Failed to load tracking details")
      } finally {
        setLoading(false)
      }
    }

    fetchTracking()
  }, [token])

  useEffect(() => {
    // Set dynamic tab title
    if (data?.trackingId || data?.orderId) {
      document.title = `Tracking ${data.trackingId || data.orderId} | MOTOCLUB`
    } else {
      document.title = "Live Shipment & Parcel Tracking | MOTOCLUB"
    }
  }, [data])

  useEffect(() => {
    // Set tracking favicon to circular MOTO logo
    if (typeof document !== "undefined") {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      link.type = "image/svg+xml"
      link.href = "/track-favicon.svg"
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      router.push(`/track/${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleCopyAwb = (id: string) => {
    if (!id || typeof navigator === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusBadge = (statusStr: string) => {
    const s = (statusStr || "").toLowerCase()
    if (s === "delivered" || s === "completed") {
      return {
        bg: "bg-emerald-950/80 border-emerald-700/80 text-emerald-400",
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: "Delivered",
      }
    }
    if (s.includes("out")) {
      return {
        bg: "bg-amber-950/80 border-amber-700/80 text-amber-400",
        icon: <Truck className="h-3.5 w-3.5" />,
        label: "Out for Delivery",
      }
    }
    if (s.includes("transit") || s.includes("arrived") || s.includes("way")) {
      return {
        bg: "bg-blue-950/80 border-blue-700/80 text-blue-400",
        icon: <ArrowRight className="h-3.5 w-3.5" />,
        label: "In Transit",
      }
    }
    if (s.includes("return") || s.includes("cancel") || s.includes("fail")) {
      return {
        bg: "bg-rose-950/80 border-rose-700/80 text-rose-400",
        icon: <Package className="h-3.5 w-3.5" />,
        label: statusStr,
      }
    }
    return {
      bg: "bg-indigo-950/80 border-indigo-700/80 text-indigo-400",
      icon: <Package className="h-3.5 w-3.5" />,
      label: statusStr || "Processing",
    }
  }

  const getTimelineIconStyle = (statusStr: string, idx: number) => {
    const s = (statusStr || "").toLowerCase()
    if (s.includes("deliver")) {
      return {
        bg: "bg-emerald-500 text-white shadow-emerald-500/20",
        icon: <Check className="h-4 w-4 stroke-[2.5]" />,
      }
    }
    if (s.includes("out")) {
      return {
        bg: "bg-amber-500 text-white shadow-amber-500/20",
        icon: <Truck className="h-4 w-4" />,
      }
    }
    if (s.includes("transit") || s.includes("arrived") || s.includes("way") || s.includes("reach")) {
      return {
        bg: "bg-blue-500 text-white shadow-blue-500/20",
        icon: <ArrowRight className="h-4 w-4" />,
      }
    }
    if (s.includes("book") || s.includes("placed") || s.includes("pickup") || s.includes("dispatch")) {
      return {
        bg: "bg-violet-500 text-white shadow-violet-500/20",
        icon: <Package className="h-4 w-4" />,
      }
    }
    return {
      bg: idx === 0 ? "bg-blue-600 text-white" : "bg-slate-400 text-white",
      icon: <Package className="h-4 w-4" />,
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FC] text-slate-900 flex flex-col items-center py-6 px-4">
      {/* Top Header */}
      <header className="flex flex-col items-center mb-6 text-center">
        <div className="h-12 w-12 rounded-full bg-black flex items-center justify-center text-white font-black text-xs tracking-tight border border-slate-700 shadow-md shrink-0">
          MOTO
        </div>
        <h1 className="font-extrabold text-base text-slate-900 tracking-tight mt-2">
          MOTOCLUB
        </h1>
        <span className="text-xs text-slate-500 font-medium mt-0.5 tracking-tight">
          Live Shipment & Parcel Tracking
        </span>
        <span className="text-[11px] text-slate-400 font-medium mt-0.5 tracking-tight">
          powered by opencoders
        </span>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-2xl space-y-6">
        {/* Search Bar */}
        <form
          onSubmit={handleSearch}
          className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-2 pl-4 pr-2"
        >
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter Tracking ID, AWB, or Order #..."
            className="flex-1 bg-transparent text-sm text-slate-800 font-medium focus:outline-none placeholder:text-slate-400 font-mono"
          />
          <button
            type="submit"
            className="bg-[#0F172A] hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            Track Now
          </button>
        </form>

        {loading && (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-slate-900 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Checking...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-white p-8 rounded-3xl border border-rose-200 shadow-sm text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h3 className="text-base font-bold text-slate-900">Shipment Details Unavailable</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Shipment Details Dark Card */}
            <div className="bg-slate-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden space-y-6 border border-slate-900">
              {/* Header: Carrier info & Status */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black tracking-tight text-white">Shipment Details</h2>
                    {data.orderId && data.orderId.startsWith("#") && (
                      <span className="text-xs font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono">
                        {data.orderId}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      {data.courierServiceName}
                    </span>

                    {data.trackingId && (
                      <div className="inline-flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-xs font-mono text-slate-300">
                        <span>AWB: {data.trackingId}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyAwb(data.trackingId)}
                          className="hover:text-white transition-colors p-0.5"
                          title="Copy AWB number"
                        >
                          {copied ? (
                            <CheckCheck className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-slate-400" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                {(() => {
                  const badge = getStatusBadge(data.deliveryStatus)
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border shrink-0 ${badge.bg}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>
                  )
                })()}
              </div>

              {/* Delivery Banner: Delivered or Expected Delivery */}
              {(() => {
                const s = (data.deliveryStatus || "").toLowerCase()
                if (s === "delivered" || s === "completed") {
                  return (
                    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>Package delivered successfully • Last confirmed on {data.lastUpdate}</span>
                    </div>
                  )
                }
                if (data.expectedDelivery || data.additionalInfo) {
                  return (
                    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs font-medium">
                      <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>{data.expectedDelivery || data.additionalInfo}</span>
                    </div>
                  )
                }
                return null
              })()}

              {/* Grid: Authentic Shipment Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* 1. Current Location */}
                <div className="bg-slate-900/60 rounded-2xl p-3.5 border border-slate-850">
                  <span className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    Current Location
                  </span>
                  <span className="font-bold text-white text-sm block tracking-tight">
                    {data.currentLocation || "In Transit"}
                  </span>
                </div>

                {/* 2. Destination */}
                <div className="bg-slate-900/60 rounded-2xl p-3.5 border border-slate-850">
                  <span className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Navigation className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    Destination Address
                  </span>
                  <span className="font-bold text-white text-sm block leading-snug">
                    {data.destination}
                  </span>
                </div>

                {/* 3. Recipient Information */}
                <div className="bg-slate-900/60 rounded-2xl p-3.5 border border-slate-850">
                  <span className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    Recipient
                  </span>
                  <span className="font-bold text-white text-sm block">
                    {data.customerName || "Customer"}
                  </span>
                </div>

                {/* 4. Origin & Last Update */}
                <div className="bg-slate-900/60 rounded-2xl p-3.5 border border-slate-850">
                  <span className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    Shipped From & Last Scan
                  </span>
                  <span className="font-bold text-white text-sm block">
                    {data.origin || "MotoClub Store"}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                    Last update: {data.lastUpdate}
                  </span>
                </div>
              </div>

              {/* Direct Track Official Carrier Button */}
              {data.courierTrackingUrl && (
                <div className="pt-1">
                  <a
                    href={data.courierTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-900 hover:bg-slate-850 hover:text-white text-slate-200 rounded-2xl text-xs font-bold transition-all border border-slate-700 shadow-sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
                    Track Directly on {data.courierServiceName} Official Portal
                  </a>
                </div>
              )}
            </div>

            {/* Tracking History Container Card */}
            <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-150 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Tracking History
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authentic scan checkpoints from origin to destination
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full font-mono">
                  {data.timeline.length} {data.timeline.length === 1 ? "Scan" : "Scans"}
                </span>
              </div>

              <div className="relative space-y-4">
                {data.timeline.map((event, idx) => {
                  const style = getTimelineIconStyle(event.title || event.status, idx)
                  return (
                    <div key={idx} className="flex items-start gap-4 relative">
                      {/* Timeline icon & connecting line */}
                      <div className="flex flex-col items-center shrink-0 pt-0.5">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center shadow-md z-10 ${style.bg}`}
                        >
                          {style.icon}
                        </div>
                        {idx < data.timeline.length - 1 && (
                          <div className="w-0.5 bg-slate-200 flex-1 my-1.5 min-h-[44px]" />
                        )}
                      </div>

                      {/* Checkpoint Detail Card */}
                      <div className="flex-1 bg-slate-50/80 hover:bg-slate-50 rounded-2xl p-4 shadow-sm border border-slate-200/90 space-y-2 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                            {event.title}
                          </span>
                          <span className="text-xs font-mono text-slate-500 font-medium bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            {event.date}
                          </span>
                        </div>

                        {/* Activity Narrative */}
                        {event.activity && (
                          <p className="text-xs text-slate-600 leading-relaxed font-normal">
                            {event.activity}
                          </p>
                        )}

                        {/* Location and Carrier Tag */}
                        {(event.location || event.courierName) && (
                          <div className="flex flex-wrap items-center gap-3 pt-1.5 text-xs border-t border-slate-200/70 mt-1">
                            {event.location && (
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                                <MapPin className="h-3 w-3 text-rose-500 shrink-0" />
                                {event.location}
                              </span>
                            )}
                            {event.courierName && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <Truck className="h-3 w-3 text-slate-400 shrink-0" />
                                {event.courierName}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
