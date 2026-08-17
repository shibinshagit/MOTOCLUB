"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Check, Package, ExternalLink, Loader2, Search } from "lucide-react"

type TimelineEvent = {
  status: string
  title: string
  date: string
  from?: string
  to?: string
  contact?: string
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
  contact: string
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      router.push(`/track/${encodeURIComponent(searchInput.trim())}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FC] text-slate-900 flex flex-col items-center py-6 px-4">
      {/* Top Header */}
      <header className="flex flex-col items-center mb-8">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center text-white font-bold text-xs tracking-tighter border border-slate-700 shadow-md">
            MOTO
          </div>
        </div>
        <span className="text-[11px] text-slate-500 font-medium mt-1.5 tracking-tight">
          powered by opencoders
        </span>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-2xl space-y-6">
        {/* Search Bar */}
        <form
          onSubmit={handleSearch}
          className="bg-white p-2 rounded-full shadow-sm border border-slate-200 flex items-center gap-2 pl-6 pr-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Enter Tracking ID or Token..."
            className="flex-1 bg-transparent text-sm text-slate-800 font-medium focus:outline-none placeholder:text-slate-400 font-mono"
          />
          <button
            type="submit"
            className="bg-[#0F172A] hover:bg-black text-white px-6 py-2.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Search className="h-3.5 w-3.5" />
            Track Now
          </button>
        </form>

        {loading && (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
            <Loader2 className="h-8 w-8 text-slate-900 animate-spin" />
            <p className="text-sm font-medium text-slate-600">Fetching shipment tracking status...</p>
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
            <div className="bg-black text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden space-y-6 border border-slate-900">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-white">Shipment Details</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    {data.courierServiceName} ({data.courierPartnerName}) - {data.trackingId || data.orderId}
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                  {data.deliveryStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium mb-1">Current Location</span>
                  <span className="font-bold text-white text-sm">{data.currentLocation}</span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium mb-1">Destination</span>
                  <span className="font-bold text-white text-sm">{data.destination}</span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium mb-1">Contact</span>
                  <span className="font-bold text-white text-sm">
                    {data.contact ? `( ${data.contact} )` : "—"}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium mb-1">Last Update</span>
                  <span className="font-bold text-white text-sm">{data.lastUpdate}</span>
                </div>
              </div>

              {data.courierTrackingUrl && (
                <div className="pt-2">
                  <a
                    href={data.courierTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors border border-slate-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Track Directly on {data.courierServiceName} Official Site
                  </a>
                </div>
              )}
            </div>

            {/* Tracking History Container Card */}
            <div className="bg-[#6B7280] text-white p-6 sm:p-8 rounded-3xl shadow-lg space-y-6">
              <h3 className="text-base font-bold text-white tracking-tight">Tracking History</h3>

              <div className="relative space-y-4">
                {data.timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start gap-4 relative">
                    {/* Icon circle */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="h-8 w-8 rounded-full bg-[#3B82F6] flex items-center justify-center text-white shadow-md z-10">
                        {idx === 0 ? <Check className="h-4 w-4 stroke-[3]" /> : <Package className="h-4 w-4" />}
                      </div>
                      {idx < data.timeline.length - 1 && (
                        <div className="w-0.5 bg-slate-400/60 flex-1 my-1 min-h-[40px]" />
                      )}
                    </div>

                    {/* Content Card */}
                    <div className="flex-1 bg-[#374151] rounded-2xl p-4 shadow-sm border border-slate-600/60 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-white">
                          {event.title}
                        </span>
                        <span className="text-[11px] text-slate-300 font-medium">
                          {event.date}
                        </span>
                      </div>

                      {event.from && (
                        <p className="text-xs text-slate-300">
                          <span className="text-slate-400">From:</span> {event.from}
                        </p>
                      )}
                      {event.to && (
                        <p className="text-xs text-slate-300">
                          <span className="text-slate-400">To:</span> {event.to}
                        </p>
                      )}
                      {event.contact && (
                        <p className="text-xs text-slate-300">
                          <span className="text-slate-400">Contact:</span> {event.contact}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
