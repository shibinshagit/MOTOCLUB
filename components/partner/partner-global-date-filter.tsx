"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useEffect, useTransition } from "react"
import { Calendar, Loader2, RotateCcw } from "lucide-react"

const DATE_PRESETS = [
  { value: "Today", label: "Today" },
  { value: "Last 7 Days", label: "Last 7 Days" },
  { value: "This Month", label: "This Month" },
  { value: "Last Month", label: "Last Month" },
  { value: "Custom Range", label: "Custom Range" },
  { value: "All", label: "All Time" },
]

export function PartnerGlobalDateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const dateRangeParam = searchParams.get("dateRange") || "This Month"
  const fromDateParam = searchParams.get("fromDate") || ""
  const toDateParam = searchParams.get("toDate") || ""

  const [dateRange, setDateRange] = useState(dateRangeParam)
  const [fromDate, setFromDate] = useState(fromDateParam)
  const [toDate, setToDate] = useState(toDateParam)

  useEffect(() => {
    setDateRange(searchParams.get("dateRange") || "This Month")
    setFromDate(searchParams.get("fromDate") || "")
    setToDate(searchParams.get("toDate") || "")
  }, [searchParams])

  const applyRange = (newRange: string, newFrom = fromDate, newTo = toDate) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("dateRange", newRange)
    params.set("page", "1")

    if (newRange === "Custom Range") {
      if (newFrom) params.set("fromDate", newFrom)
      else params.delete("fromDate")
      if (newTo) params.set("toDate", newTo)
      else params.delete("toDate")
    } else {
      params.delete("fromDate")
      params.delete("toDate")
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const handleSelectPreset = (val: string) => {
    setDateRange(val)
    applyRange(val, fromDate, toDate)
  }

  const handleFromChange = (val: string) => {
    setFromDate(val)
    applyRange("Custom Range", val, toDate)
  }

  const handleToChange = (val: string) => {
    setToDate(val)
    applyRange("Custom Range", fromDate, val)
  }

  return (
    <div className="bg-white p-3.5 sm:p-4 rounded-xl shadow-xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <div className="bg-indigo-50 p-2 rounded-lg shrink-0 text-indigo-600">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div>
          <span className="font-bold text-slate-900 text-sm block">Global Date Filter</span>
          <span className="text-[11px] text-slate-500 font-medium">Controls cards, graph & assigned orders</span>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-indigo-600 ml-2" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 overflow-x-auto max-w-full">
          {DATE_PRESETS.map((p) => {
            const isActive = dateRange === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handleSelectPreset(p.value)}
                className={`px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {dateRange === "Custom Range" && (
          <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFromChange(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-slate-400 font-bold">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleToChange(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>
    </div>
  )
}
