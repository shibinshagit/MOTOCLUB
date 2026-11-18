/**
 * Utility functions for Indian Standard Time (IST / Asia/Kolkata, UTC+5:30).
 * Ensures date parsing, formatting, and selection represent Indian time uniformly
 * without displaying "IST" labels anywhere in the UI.
 */

export const IST_TIMEZONE = "Asia/Kolkata"

/**
 * Normalizes any string representation so that date-time strings without timezone
 * offsets are strictly treated as Indian Standard Time (+05:30).
 */
export function normalizeToISTString(input: string | Date | null | undefined): string | Date | null {
  if (!input) return null
  if (typeof input !== "string") return input
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed
  }
  const clean = trimmed.replace(" ", "T")
  return clean.length === 16 ? `${clean}:00+05:30` : (clean.length === 19 ? `${clean}+05:30` : clean)
}

/**
 * Format date/time string or Date in Indian Standard Time.
 * Examples:
 * - "full": "Wednesday, 18 Nov 2026 • 10:00 AM"
 * - "short": "18 Nov, 10:00 AM"
 * - "date": "18 Nov 2026"
 * - "time": "10:00 AM"
 */
export function formatIST(
  dateInput: string | Date | null | undefined,
  formatStyle: "full" | "short" | "date" | "time" | "longDate" | "picker" = "full"
): string {
  if (!dateInput) return ""
  const normalized = normalizeToISTString(dateInput)
  if (!normalized) return ""
  const d = typeof normalized === "string" ? new Date(normalized) : normalized
  if (isNaN(d.getTime())) return ""

  if (formatStyle === "picker") {
    const dayFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    const timeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    return `${dayFormatter.format(d)}, ${timeFormatter.format(d).toUpperCase()}`
  }

  if (formatStyle === "full") {
    const dayFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    const timeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    return `${dayFormatter.format(d)} • ${timeFormatter.format(d).toUpperCase()}`
  }

  if (formatStyle === "short") {
    const dayFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
    })
    const timeFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    return `${dayFormatter.format(d)}, ${timeFormatter.format(d).toUpperCase()}`
  }

  if (formatStyle === "time") {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    return formatter.format(d).toUpperCase()
  }

  if (formatStyle === "date") {
    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    return formatter.format(d)
  }

  // longDate (e.g. "Wed, 18 Nov")
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
  return formatter.format(d)
}

/**
 * Parse an ISO or date string into its Indian Standard Time components:
 * calendar date (as local Date object with year/month/day), hours (1-12), minutes, and period ("AM" | "PM").
 */
export function getISTComponents(dateInput: string | Date | null | undefined): {
  date: Date
  hours12: number
  minutes: number
  period: "AM" | "PM"
} {
  const normalized = normalizeToISTString(dateInput)
  const d = normalized ? (typeof normalized === "string" ? new Date(normalized) : normalized) : new Date()
  const validDate = isNaN(d.getTime()) ? new Date() : d

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  })

  const parts = formatter.formatToParts(validDate)
  let y = 0
  let m = 0
  let day = 0
  let h12 = 10
  let min = 0
  let period: "AM" | "PM" = "AM"

  for (const part of parts) {
    if (part.type === "year") y = Number(part.value)
    if (part.type === "month") m = Number(part.value) - 1
    if (part.type === "day") day = Number(part.value)
    if (part.type === "hour") h12 = Number(part.value)
    if (part.type === "minute") min = Number(part.value)
    if (part.type === "dayPeriod") period = part.value.toUpperCase() === "PM" ? "PM" : "AM"
  }

  return {
    date: new Date(y, m, day),
    hours12: h12 || 12,
    minutes: min,
    period,
  }
}

/**
 * Given a selected calendar date, 12-hour hour, minutes, and period ("AM" | "PM"),
 * builds an ISO string representing that EXACT time in Indian Standard Time (UTC+5:30).
 * E.g., Date(2026-11-18), 10, 0, "AM" -> "2026-11-18T10:00:00+05:30"
 */
export function buildISTISOString(
  date: Date,
  hours12: number,
  minutes: number,
  period: "AM" | "PM"
): string {
  const y = date.getFullYear()
  const mon = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  let h24 = hours12 % 12
  if (period === "PM") h24 += 12
  const hrs = String(h24).padStart(2, "0")
  const mins = String(minutes).padStart(2, "0")

  return `${y}-${mon}-${d}T${hrs}:${mins}:00+05:30`
}

/**
 * Convert any date input (ISO with +05:30, Date object, or plain string)
 * into a SQL-friendly string formatted in Indian Standard Time (YYYY-MM-DD HH:mm:ss).
 * Safe for PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns.
 */
export function parseToISTDbString(dtInput?: string | Date | null): string | null {
  if (!dtInput) return null
  const normalized = normalizeToISTString(dtInput)
  if (!normalized) return null
  const d = typeof normalized === "string" ? new Date(normalized) : normalized
  if (isNaN(d.getTime())) return null

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  return formatter.format(d).replace(",", "").trim()
}

/**
 * Check if a date is "today" in Indian Standard Time
 */
export function isTodayIST(dateInput: string | Date | null | undefined): boolean {
  if (!dateInput) return false
  const normalized = normalizeToISTString(dateInput)
  if (!normalized) return false
  const d = typeof normalized === "string" ? new Date(normalized) : normalized
  if (isNaN(d.getTime())) return false

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })

  return formatter.format(d) === formatter.format(new Date())
}

/**
 * Check if a date is in the past compared to current IST time
 */
export function isPastIST(dateInput: string | Date | null | undefined): boolean {
  if (!dateInput) return false
  const normalized = normalizeToISTString(dateInput)
  if (!normalized) return false
  const d = typeof normalized === "string" ? new Date(normalized) : normalized
  if (isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}
