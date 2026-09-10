"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Calendar as CalendarIcon,
  ChevronDown,
  RotateCcw,
  Check,
} from "lucide-react"
import { format, parseISO, isValid, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  selectDateRange,
  setDateRange,
  resetDateRange,
  isValidIsoDateString,
  getTodayDateString,
  type DatePreset,
} from "@/store/slices/dateRangeSlice"

interface GlobalDateFilterProps {
  className?: string
  compact?: boolean
}

export default function GlobalDateFilter({ className, compact = false }: GlobalDateFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dispatch = useAppDispatch()
  const dateRange = useAppSelector(selectDateRange)

  const [isOpen, setIsOpen] = useState(false)
  const [localFrom, setLocalFrom] = useState(dateRange.from)
  const [localTo, setLocalTo] = useState(dateRange.to)
  const [localPreset, setLocalPreset] = useState<DatePreset>(dateRange.preset)

  // Sync internal state when Redux date range changes externally
  useEffect(() => {
    setLocalFrom(dateRange.from)
    setLocalTo(dateRange.to)
    setLocalPreset(dateRange.preset)
  }, [dateRange.from, dateRange.to, dateRange.preset])

  // Hydrate from URL query parameters on initial mount if present
  useEffect(() => {
    const urlFrom = searchParams?.get("from")
    const urlTo = searchParams?.get("to")
    const urlPreset = searchParams?.get("preset") as DatePreset | null

    if (isValidIsoDateString(urlFrom) && isValidIsoDateString(urlTo)) {
      if (urlFrom !== dateRange.from || urlTo !== dateRange.to) {
        dispatch(
          setDateRange({
            from: urlFrom,
            to: urlTo,
            preset: urlPreset || (urlFrom === urlTo ? (urlFrom === getTodayDateString() ? "today" : "custom") : "custom"),
          }),
        )
      }
    }
  }, [searchParams, dispatch])

  // Update browser URL query parameters without full page reload
  const syncToUrl = useCallback(
    (fromVal: string, toVal: string, presetVal?: DatePreset) => {
      if (typeof window === "undefined") return
      const url = new URL(window.location.href)
      url.searchParams.set("from", fromVal)
      url.searchParams.set("to", toVal)
      if (presetVal && presetVal !== "custom") {
        url.searchParams.set("preset", presetVal)
      } else {
        url.searchParams.delete("preset")
      }
      router.replace(url.pathname + url.search, { scroll: false })
    },
    [router],
  )

  // Quick preset helper
  const applyPreset = useCallback(
    (preset: DatePreset) => {
      const today = new Date()
      let fromDate: Date
      let toDate: Date

      switch (preset) {
        case "today":
          fromDate = today
          toDate = today
          break
        case "yesterday":
          fromDate = subDays(today, 1)
          toDate = subDays(today, 1)
          break
        case "last7days":
          fromDate = subDays(today, 6)
          toDate = today
          break
        case "this_month":
          fromDate = startOfMonth(today)
          toDate = endOfMonth(today)
          break
        case "last_month":
          const lastMonth = subMonths(today, 1)
          fromDate = startOfMonth(lastMonth)
          toDate = endOfMonth(lastMonth)
          break
        case "custom":
        default:
          setLocalPreset("custom")
          return
      }

      const fromStr = format(fromDate, "yyyy-MM-dd")
      const toStr = format(toDate, "yyyy-MM-dd")

      setLocalFrom(fromStr)
      setLocalTo(toStr)
      setLocalPreset(preset)

      dispatch(setDateRange({ from: fromStr, to: toStr, preset }))
      syncToUrl(fromStr, toStr, preset)
      setIsOpen(false)
    },
    [dispatch, syncToUrl],
  )

  // Handle custom range submission
  const handleApplyCustom = () => {
    if (!isValidIsoDateString(localFrom) || !isValidIsoDateString(localTo)) {
      return
    }

    let finalFrom = localFrom
    let finalTo = localTo

    // If user inverted from and to, swap them
    if (finalFrom > finalTo) {
      const temp = finalFrom
      finalFrom = finalTo
      finalTo = temp
      setLocalFrom(finalFrom)
      setLocalTo(finalTo)
    }

    const todayStr = getTodayDateString()
    const determinedPreset: DatePreset =
      finalFrom === finalTo && finalFrom === todayStr ? "today" : "custom"

    setLocalPreset(determinedPreset)
    dispatch(setDateRange({ from: finalFrom, to: finalTo, preset: determinedPreset }))
    syncToUrl(finalFrom, finalTo, determinedPreset)
    setIsOpen(false)
  }

  const handleReset = () => {
    dispatch(resetDateRange())
    const today = new Date()
    const fromStr = format(startOfMonth(today), "yyyy-MM-dd")
    const toStr = format(endOfMonth(today), "yyyy-MM-dd")
    setLocalFrom(fromStr)
    setLocalTo(toStr)
    setLocalPreset("this_month")
    syncToUrl(fromStr, toStr, "this_month")
    setIsOpen(false)
  }

  // Formatted display strings
  const formattedLabel = useMemo(() => {
    if (!isValidIsoDateString(dateRange.from) || !isValidIsoDateString(dateRange.to)) {
      return "Select Date"
    }

    const fromDate = parseISO(dateRange.from)
    const toDate = parseISO(dateRange.to)
    const todayStr = getTodayDateString()

    if (dateRange.from === dateRange.to) {
      if (dateRange.from === todayStr) {
        return `Today: ${format(fromDate, "dd/MM/yyyy")}`
      }
      return format(fromDate, "dd/MM/yyyy")
    }

    return `${format(fromDate, "dd/MM/yyyy")} → ${format(toDate, "dd/MM/yyyy")}`
  }, [dateRange.from, dateRange.to])

  const compactLabel = useMemo(() => {
    if (!isValidIsoDateString(dateRange.from) || !isValidIsoDateString(dateRange.to)) {
      return "Date"
    }
    const todayStr = getTodayDateString()
    if (dateRange.from === dateRange.to && dateRange.from === todayStr) {
      return "Today"
    }
    const fromDate = parseISO(dateRange.from)
    const toDate = parseISO(dateRange.to)
    if (dateRange.from === dateRange.to) {
      return format(fromDate, "dd/MM")
    }
    return `${format(fromDate, "dd/MM")} - ${format(toDate, "dd/MM")}`
  }, [dateRange.from, dateRange.to])

  const presetOptions: { id: DatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last7days", label: "Last 7 Days" },
    { id: "this_month", label: "This Month" },
    { id: "last_month", label: "Last Month" },
    { id: "custom", label: "Custom Range" },
  ]

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors rounded-lg flex items-center gap-1.5 px-2.5 sm:px-3",
            isOpen && "border-violet-500 ring-2 ring-violet-100",
            className,
          )}
          title="Global Date Range Filter"
        >
          <CalendarIcon className="h-4 w-4 text-violet-600 shrink-0" />
          
          {/* Desktop full text */}
          <span className="hidden md:inline font-medium text-xs text-slate-800 whitespace-nowrap">
            {formattedLabel}
          </span>

          {/* Tablet compact text */}
          <span className="hidden sm:inline md:hidden font-medium text-xs text-slate-800 whitespace-nowrap">
            {compactLabel}
          </span>

          {/* Mobile view */}
          <span className="inline sm:hidden font-medium text-xs text-slate-800 max-w-[85px] truncate">
            {compactLabel}
          </span>

          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-0.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        sideOffset={6}
        className="w-80 sm:w-96 p-4 rounded-xl shadow-xl border border-slate-200 bg-white z-50 text-slate-900"
      >
        <div className="flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Filter by Date Range
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              title="Reset to this month"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset Month
            </Button>
          </div>

          {/* Preset Buttons Grid */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
              Quick Presets
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {presetOptions.map((opt) => {
                const isSelected = localPreset === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === "custom") {
                        setLocalPreset("custom")
                      } else {
                        applyPreset(opt.id)
                      }
                    }}
                    className={cn(
                      "text-xs py-1.5 px-2 rounded-md font-medium border text-center transition-all flex items-center justify-center gap-1",
                      isSelected
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200",
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3 shrink-0" />}
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={localFrom}
                  max={localTo}
                  onChange={(e) => {
                    setLocalFrom(e.target.value)
                    setLocalPreset("custom")
                  }}
                  className="w-full text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={localTo}
                  min={localFrom}
                  onChange={(e) => {
                    setLocalTo(e.target.value)
                    setLocalPreset("custom")
                  }}
                  className="w-full text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500 truncate max-w-[170px]">
                {localFrom && localTo
                  ? `${format(parseISO(localFrom), "dd/MM/yyyy")} → ${format(parseISO(localTo), "dd/MM/yyyy")}`
                  : "Pick custom dates"}
              </span>

              <Button
                size="sm"
                onClick={handleApplyCustom}
                disabled={!localFrom || !localTo}
                className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-sm"
              >
                Apply Range
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
