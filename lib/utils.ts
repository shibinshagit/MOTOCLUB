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
