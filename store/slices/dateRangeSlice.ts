import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { format, isValid, parseISO, startOfMonth, endOfMonth } from "date-fns"
import type { RootState } from "../store"

export type DatePreset = "today" | "yesterday" | "last7days" | "this_month" | "last_month" | "custom"

export interface DateRangeState {
  from: string // "yyyy-MM-dd"
  to: string   // "yyyy-MM-dd"
  preset: DatePreset
}

export function getTodayDateString(): string {
  return format(new Date(), "yyyy-MM-dd")
}

export function getThisMonthDateRange(): DateRangeState {
  const now = new Date()
  return {
    from: format(startOfMonth(now), "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    preset: "this_month",
  }
}

export function isValidIsoDateString(val: string | null | undefined): val is string {
  if (!val || typeof val !== "string") return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false
  const parsed = parseISO(val)
  return isValid(parsed)
}

function getInitialState(): DateRangeState {
  const thisMonthDefault = getThisMonthDateRange()
  const today = getTodayDateString()

  // In browser, attempt to hydrate from URL parameters first, then sessionStorage
  if (typeof window !== "undefined") {
    try {
      const searchParams = new URLSearchParams(window.location.search)
      const urlFrom = searchParams.get("from")
      const urlTo = searchParams.get("to")
      const urlPreset = searchParams.get("preset") as DatePreset | null

      if (isValidIsoDateString(urlFrom) && isValidIsoDateString(urlTo)) {
        let inferredPreset: DatePreset = "custom"
        if (urlPreset) {
          inferredPreset = urlPreset
        } else if (urlFrom === thisMonthDefault.from && urlTo === thisMonthDefault.to) {
          inferredPreset = "this_month"
        } else if (urlFrom === urlTo && urlFrom === today) {
          inferredPreset = "today"
        }
        return {
          from: urlFrom,
          to: urlTo,
          preset: inferredPreset,
        }
      }

      const stored = sessionStorage.getItem("motoclub_global_date_range")
      if (stored) {
        const parsed = JSON.parse(stored)
        if (isValidIsoDateString(parsed.from) && isValidIsoDateString(parsed.to)) {
          return {
            from: parsed.from,
            to: parsed.to,
            preset: parsed.preset || "custom",
          }
        }
      }
    } catch {
      // Fall through to default
    }
  }

  return thisMonthDefault
}

const initialState: DateRangeState = getInitialState()

export const dateRangeSlice = createSlice({
  name: "dateRange",
  initialState,
  reducers: {
    setDateRange: (
      state,
      action: PayloadAction<{ from: string; to: string; preset?: DatePreset }>,
    ) => {
      const { from, to, preset } = action.payload
      if (isValidIsoDateString(from) && isValidIsoDateString(to)) {
        state.from = from
        state.to = to
        state.preset = preset || "custom"

        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(
              "motoclub_global_date_range",
              JSON.stringify({ from, to, preset: state.preset }),
            )
          } catch {}
        }
      }
    },
    resetDateRange: (state) => {
      const defaultMonth = getThisMonthDateRange()
      state.from = defaultMonth.from
      state.to = defaultMonth.to
      state.preset = defaultMonth.preset

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            "motoclub_global_date_range",
            JSON.stringify(defaultMonth),
          )
        } catch {}
      }
    },
  },
})

export const { setDateRange, resetDateRange } = dateRangeSlice.actions

export const selectDateRange = (state: RootState): DateRangeState => state.dateRange
export const selectDateRangeFrom = (state: RootState): string => state.dateRange.from
export const selectDateRangeTo = (state: RootState): string => state.dateRange.to
export const selectDateRangePreset = (state: RootState): DatePreset => state.dateRange.preset

export default dateRangeSlice.reducer
