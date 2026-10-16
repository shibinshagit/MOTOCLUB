import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (amount: number, currency = "QAR") => {
  // Define currency formatting options for different currencies
  const currencyFormats: Record<string, { locale: string; currency: string }> = {
    QAR: { locale: "en-QA", currency: "QAR" },
    USD: { locale: "en-US", currency: "USD" },
    EUR: { locale: "en-DE", currency: "EUR" },
    GBP: { locale: "en-GB", currency: "GBP" },
    AED: { locale: "en-AE", currency: "AED" },
    SAR: { locale: "en-SA", currency: "SAR" },
    KWD: { locale: "en-KW", currency: "KWD" },
    BHD: { locale: "en-BH", currency: "BHD" },
    OMR: { locale: "en-OM", currency: "OMR" },
    INR: { locale: "en-IN", currency: "INR" },
    PKR: { locale: "en-PK", currency: "PKR" },
  }

  // Get format options for the specified currency, or default to QAR
  const normalized = (currency || "QAR").trim().toUpperCase()
  const format = currencyFormats[normalized] || { locale: "en-US", currency: normalized }

  return new Intl.NumberFormat(format.locale, {
    style: "currency",
    currency: format.currency,
  }).format(amount)
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ""
  let digits = phone.replace(/\D/g, "")
  if (!digits) return ""

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return "+91 " + digits
  }
  if (digits.length === 10 && digits.startsWith("05")) {
    return "+971 " + digits.substring(1)
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    return "+971 " + digits
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+91 " + digits.substring(2)
  }
  if (digits.length === 12 && (digits.startsWith("971") || digits.startsWith("0971"))) {
    // 0971 is 4 chars, wait digits is 12, so 971 is 3 chars.
    return "+971 " + digits.substring(3)
  }

  if (phone.includes(" ")) return phone;

  // Fallback for unknown country codes
  return phone.startsWith("+") ? phone : "+" + digits
}

export function parseSaleDate(dateInput: any): Date {
  if (!dateInput) return new Date()

  let dt = dateInput
  if (typeof dt === "string") {
    const trimmed = dt.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match
      return new Date(Number(y), Number(m) - 1, Number(d))
    }
    dt = new Date(trimmed)
  }

  if (dt instanceof Date && !isNaN(dt.getTime())) {
    const isUtcMidnight =
      dt.getUTCHours() === 0 &&
      dt.getUTCMinutes() === 0 &&
      dt.getUTCSeconds() === 0 &&
      dt.getUTCMilliseconds() === 0

    if (isUtcMidnight) {
      return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
    } else {
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    }
  }

  return new Date()
}

export function parseSaleDateTime(sale: any): Date {
  if (!sale) return new Date()

  let saleDateVal = sale?.sale_date ?? sale?.created_at
  let createdAtVal = sale?.created_at

  if (sale instanceof Date || typeof sale === "string" || typeof sale === "number") {
    saleDateVal = sale
    createdAtVal = undefined
  }

  if (!saleDateVal && !createdAtVal) return new Date()

  // Helper to extract calendar date components [y, m, d]
  const extractYMD = (val: any): { year: number; month: number; day: number } | null => {
    if (!val) return null
    if (typeof val === "string") {
      const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        return {
          year: Number(match[1]),
          month: Number(match[2]) - 1,
          day: Number(match[3]),
        }
      }
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
      return {
        year: val.getFullYear(),
        month: val.getMonth(),
        day: val.getDate(),
      }
    }
    return null
  }

  // Helper to safely parse any date/time string or Date
  const parseSafe = (input: any): Date | null => {
    if (!input) return null
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input
    }
    if (typeof input === "string") {
      const trimmed = input.trim()
      if (!trimmed) return null
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [y, m, d] = trimmed.split("-").map(Number)
        return new Date(y, m - 1, d, 0, 0, 0)
      }
      const isoCandidate = trimmed.includes(" ") && !trimmed.includes("T")
        ? trimmed.replace(" ", "T")
        : trimmed
      const d = new Date(isoCandidate)
      return isNaN(d.getTime()) ? null : d
    }
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }

  // Helper to check if a value is midnight / zero time (i.e. missing entry time)
  const isMidnight = (d: Date | null, rawVal: any): boolean => {
    if (!d) return true
    if (typeof rawVal === "string") {
      const trimmed = rawVal.trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true
      if (/(?:T|\s)00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(trimmed)) return true
    }
    const isLocalMidnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
    const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
    return isLocalMidnight || isUtcMidnight
  }

  const sDate = parseSafe(saleDateVal)
  const cDate = parseSafe(createdAtVal)

  // 1. If sale_date has a real (non-midnight) time, use it
  if (sDate && !isMidnight(sDate, saleDateVal)) {
    return sDate
  }

  // 2. If sale_date was midnight or date-only, but created_at has a real time
  if (cDate && !isMidnight(cDate, createdAtVal)) {
    const ymd = extractYMD(saleDateVal) || extractYMD(sDate)
    if (ymd) {
      return new Date(
        ymd.year,
        ymd.month,
        ymd.day,
        cDate.getHours(),
        cDate.getMinutes(),
        cDate.getSeconds()
      )
    }
    return cDate
  }

  // 3. If sDate exists with pure date, preserve calendar date at 00:00:00
  if (sDate) {
    const ymd = extractYMD(saleDateVal)
    if (ymd) {
      return new Date(ymd.year, ymd.month, ymd.day, 0, 0, 0)
    }
    return sDate
  }

  // 4. Fallback to cDate or now
  return cDate || new Date()
}

export function formatOrderId(id: any): string {
  if (id === null || id === undefined || id === "") return ""
  const strId = String(id).trim()
  if (strId.startsWith("MC-")) return strId
  return `MC-${strId}`
}


