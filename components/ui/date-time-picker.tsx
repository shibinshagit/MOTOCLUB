"use client"

import * as React from "react"
import { format, addDays, addHours, setHours, setMinutes, isToday, isTomorrow, isPast } from "date-fns"
import { Calendar as CalendarIcon, Clock, X, Check, ChevronDown } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface DateTimePickerProps {
  value?: string | null
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
}

const COMMON_TIMES = [
  { label: "10:00 AM", h: 10, m: 0 },
  { label: "11:30 AM", h: 11, m: 30 },
  { label: "02:00 PM", h: 14, m: 0 },
  { label: "04:00 PM", h: 16, m: 0 },
  { label: "06:00 PM", h: 18, m: 0 },
]

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date & time",
  className,
  id,
  disabled = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Parse current value
  const parsed = React.useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }, [value])

  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(parsed || undefined)
  const [hours12, setHours12] = React.useState<number>(() => {
    if (!parsed) return 11
    const h = parsed.getHours()
    return h === 0 ? 12 : h > 12 ? h - 12 : h
  })
  const [minutes, setMinutesVal] = React.useState<number>(() => {
    if (!parsed) return 0
    return parsed.getMinutes()
  })
  const [period, setPeriod] = React.useState<"AM" | "PM">(() => {
    if (!parsed) return "AM"
    return parsed.getHours() >= 12 ? "PM" : "AM"
  })

  // Synchronize internal state when prop changes
  React.useEffect(() => {
    if (parsed) {
      setSelectedDate(parsed)
      const h = parsed.getHours()
      setHours12(h === 0 ? 12 : h > 12 ? h - 12 : h)
      setMinutesVal(parsed.getMinutes())
      setPeriod(h >= 12 ? "PM" : "AM")
    } else {
      setSelectedDate(undefined)
    }
  }, [parsed])

  // Helper to commit date + time to parent
  const commit = (date: Date | undefined, h12: number, m: number, p: "AM" | "PM") => {
    if (!date) {
      onChange("")
      return
    }

    let h24 = h12 % 12
    if (p === "PM") h24 += 12

    const finalDate = new Date(date)
    finalDate.setHours(h24, m, 0, 0)

    const y = finalDate.getFullYear()
    const mon = String(finalDate.getMonth() + 1).padStart(2, "0")
    const d = String(finalDate.getDate()).padStart(2, "0")
    const hrs = String(finalDate.getHours()).padStart(2, "0")
    const mins = String(finalDate.getMinutes()).padStart(2, "0")

    onChange(`${y}-${mon}-${d}T${hrs}:${mins}`)
  }

  // Handle Day Selection from Calendar
  const handleDaySelect = (day: Date | undefined) => {
    setSelectedDate(day)
    if (day) {
      commit(day, hours12, minutes, period)
    } else {
      onChange("")
    }
  }

  // Handle Time Selection
  const handleTimeChange = (h12: number, m: number, p: "AM" | "PM") => {
    setHours12(h12)
    setMinutesVal(m)
    setPeriod(p)
    const baseDate = selectedDate || new Date()
    setSelectedDate(baseDate)
    commit(baseDate, h12, m, p)
  }

  // Preset Handlers
  const handlePreset = (type: "today_afternoon" | "tomorrow_morning" | "tomorrow_evening" | "in_2_days" | "next_week") => {
    const now = new Date()
    let targetDate = now
    let h12 = 11
    let m = 0
    let p: "AM" | "PM" = "AM"

    if (type === "today_afternoon") {
      targetDate = now
      h12 = 4
      p = "PM"
    } else if (type === "tomorrow_morning") {
      targetDate = addDays(now, 1)
      h12 = 10
      p = "AM"
    } else if (type === "tomorrow_evening") {
      targetDate = addDays(now, 1)
      h12 = 4
      p = "PM"
    } else if (type === "in_2_days") {
      targetDate = addDays(now, 2)
      h12 = 11
      p = "AM"
    } else if (type === "next_week") {
      targetDate = addDays(now, 7)
      h12 = 11
      p = "AM"
    }

    setSelectedDate(targetDate)
    setHours12(h12)
    setMinutesVal(m)
    setPeriod(p)
    commit(targetDate, h12, m, p)
  }

  // Format label for button
  const formattedDisplay = React.useMemo(() => {
    if (!parsed) return null
    let prefix = ""
    if (isToday(parsed)) prefix = "Today, "
    else if (isTomorrow(parsed)) prefix = "Tomorrow, "
    return `${prefix}${format(parsed, "dd MMM yyyy, p")}`
  }, [parsed])

  return (
    <div className={cn("relative flex items-center w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-between text-left font-normal h-9 px-3 bg-white border-input hover:bg-slate-50 text-xs",
              !parsed && "text-muted-foreground",
              className
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <CalendarIcon className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              {formattedDisplay ? (
                <span className="font-medium text-slate-900 truncate">{formattedDisplay}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent 
          className="w-auto p-0 z-[100] shadow-xl border-slate-200 max-w-[calc(100vw-24px)] overflow-hidden" 
          align="start"
          collisionPadding={12}
        >
          <div className="p-3 space-y-3 bg-white rounded-lg w-full max-w-[320px] sm:w-[320px]">
            {/* Quick Preset Buttons */}
            <div className="space-y-1 pb-2 border-b border-slate-100">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Quick Shortcuts
              </span>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset("today_afternoon")}
                  className="h-6 text-[11px] px-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                >
                  Today 4 PM
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset("tomorrow_morning")}
                  className="h-6 text-[11px] px-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                >
                  Tomorrow 10 AM
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset("tomorrow_evening")}
                  className="h-6 text-[11px] px-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                >
                  Tomorrow 4 PM
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset("in_2_days")}
                  className="h-6 text-[11px] px-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                >
                  In 2 Days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreset("next_week")}
                  className="h-6 text-[11px] px-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
                >
                  Next Week
                </Button>
              </div>
            </div>

            {/* Visual Calendar */}
            <div className="flex justify-center border rounded-md p-1 bg-slate-50/40">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDaySelect}
                initialFocus
                className="p-1 scale-95"
              />
            </div>

            {/* Time Chooser Section */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3 w-3 text-blue-500" /> Time Selection
                </span>
                <span className="text-xs font-bold text-blue-600">
                  {String(hours12).padStart(2, "0")}:{String(minutes).padStart(2, "0")} {period}
                </span>
              </div>

              {/* Quick Time Pills */}
              <div className="flex flex-wrap gap-1">
                {COMMON_TIMES.map((t) => (
                  <Button
                    key={t.label}
                    type="button"
                    variant={hours12 === (t.h > 12 ? t.h - 12 : t.h === 0 ? 12 : t.h) && minutes === t.m && period === (t.h >= 12 ? "PM" : "AM") ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleTimeChange(t.h > 12 ? t.h - 12 : t.h === 0 ? 12 : t.h, t.m, t.h >= 12 ? "PM" : "AM")}
                    className={cn(
                      "h-6 text-[10px] px-1.5",
                      hours12 === (t.h > 12 ? t.h - 12 : t.h === 0 ? 12 : t.h) && minutes === t.m && period === (t.h >= 12 ? "PM" : "AM")
                        ? "bg-blue-600 text-white"
                        : "bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>

              {/* Exact Hour & Minute Controls */}
              <div className="flex items-center gap-1.5 pt-1">
                {/* Hour */}
                <select
                  value={hours12}
                  onChange={(e) => handleTimeChange(Number(e.target.value), minutes, period)}
                  className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white text-slate-800 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")} hr
                    </option>
                  ))}
                </select>

                <span className="text-slate-400 font-bold">:</span>

                {/* Minute */}
                <select
                  value={minutes}
                  onChange={(e) => handleTimeChange(hours12, Number(e.target.value), period)}
                  className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white text-slate-800 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 touch-manipulation"
                >
                  {[0, 10, 15, 20, 30, 40, 45, 50].map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")} min
                    </option>
                  ))}
                </select>

                {/* AM / PM Toggle */}
                <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleTimeChange(hours12, minutes, "AM")}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded font-semibold transition-colors touch-manipulation",
                      period === "AM" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTimeChange(hours12, minutes, "PM")}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded font-semibold transition-colors touch-manipulation",
                      period === "PM" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDate(undefined)
                  onChange("")
                  setOpen(false)
                }}
                className="text-[11px] h-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 px-2"
              >
                Clear
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-[11px] h-7 bg-blue-600 hover:bg-blue-700 text-white px-3 gap-1"
              >
                <Check className="h-3 w-3" /> Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick Clear Icon if value exists */}
      {parsed && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setSelectedDate(undefined)
            onChange("")
          }}
          className="absolute right-8 text-slate-400 hover:text-slate-600 p-1"
          title="Clear date"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

