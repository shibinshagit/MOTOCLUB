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
  const format = currencyFormats[currency] || currencyFormats.QAR

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
  const saleDateVal = sale?.sale_date || sale?.created_at
  const createdAtVal = sale?.created_at

  if (!saleDateVal) return new Date()

  let saleDate = saleDateVal
  if (typeof saleDate === "string") {
    const trimmed = saleDate.trim()
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match
      const year = Number(y)
      const month = Number(m) - 1
      const day = Number(d)
      
      let hours = 0
      let minutes = 0
      let seconds = 0
      
      const timeSource = (trimmed.includes("T") && !trimmed.split("T")[1].startsWith("00:00:00"))
        ? saleDate
        : createdAtVal

      if (timeSource) {
        const tsDate = new Date(timeSource)
        if (!isNaN(tsDate.getTime())) {
          hours = tsDate.getHours()
          minutes = tsDate.getMinutes()
          seconds = tsDate.getSeconds()
        }
      }
      return new Date(year, month, day, hours, minutes, seconds)
    }
    saleDate = new Date(trimmed)
  }

  if (saleDate instanceof Date && !isNaN(saleDate.getTime())) {
    const isUtcMidnight = 
      saleDate.getUTCHours() === 0 &&
      saleDate.getUTCMinutes() === 0 &&
      saleDate.getUTCSeconds() === 0 &&
      saleDate.getUTCMilliseconds() === 0

    if (isUtcMidnight) {
      const year = saleDate.getUTCFullYear()
      const month = saleDate.getUTCMonth()
      const day = saleDate.getUTCDate()

      let hours = 0
      let minutes = 0
      let seconds = 0

      if (createdAtVal) {
        const createdAt = new Date(createdAtVal)
        if (!isNaN(createdAt.getTime())) {
          hours = createdAt.getHours()
          minutes = createdAt.getMinutes()
          seconds = createdAt.getSeconds()
        }
      }

      return new Date(year, month, day, hours, minutes, seconds)
    }

    return saleDate
  }

  return new Date()
}

export function formatOrderId(id: any): string {
  if (id === null || id === undefined || id === "") return ""
  const strId = String(id).trim()
  if (strId.startsWith("MC-")) return strId
  return `MC-${strId}`
}


