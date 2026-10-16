/**
 * Utility functions for handling currency
 */

import { getDeviceCurrency as fetchDeviceCurrency } from "@/app/actions/dashboard-actions"

// Cache for device currencies to avoid excessive server calls
const currencyCache: Record<number, string | null> = {}

// Default currency is now INR instead of QAR
const DEFAULT_CURRENCY = "INR"

// Get the currency for a device
export async function getDeviceCurrency(deviceId: number): Promise<string> {
  // Ensure deviceId is a valid number
  if (typeof deviceId !== "number" || isNaN(deviceId)) {
    console.warn(`Invalid device ID passed to getDeviceCurrency: ${deviceId}`)
    return DEFAULT_CURRENCY
  }

  // Check cache first
  if (deviceId in currencyCache) {
    return currencyCache[deviceId] || DEFAULT_CURRENCY
  }

  try {
    const currency = await fetchDeviceCurrency(deviceId)
    // Update cache
    currencyCache[deviceId] = currency
    return currency || DEFAULT_CURRENCY
  } catch (error) {
    console.error("Error fetching device currency:", error)
    return DEFAULT_CURRENCY
  }
}

// Format a number as currency
export async function formatCurrency(amount: number, deviceId?: number): Promise<string> {
  let currency = DEFAULT_CURRENCY // Default fallback

  if (deviceId !== undefined && deviceId !== null) {
    try {
      const deviceCurrency = await getDeviceCurrency(deviceId)
      if (deviceCurrency) {
        currency = deviceCurrency
      }
    } catch (error) {
      console.error("Error in formatCurrency:", error)
      // Continue with default currency
    }
  }

  return formatCurrencySync(amount, currency)
}

// Synchronous version for cases where we can't use async
export function formatCurrencySync(amount: number, currencyCode = DEFAULT_CURRENCY): string {
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
    })

    return formatter.format(amount)
  } catch (error) {
    console.error(`Error formatting currency with code ${currencyCode}:`, error)
    // Fallback to a simple format if the currency code is invalid
    return `${amount.toFixed(2)} ${DEFAULT_CURRENCY}`
  }
}

// Convert currency code (e.g. INR, USD) to display symbol (e.g. ₹, $)
export function getCurrencySymbol(currencyCode?: string): string {
  if (!currencyCode) return "₹"
  const upper = currencyCode.trim().toUpperCase()
  if (upper === "INR") return "₹"
  if (upper === "USD") return "$"
  if (upper === "EUR") return "€"
  if (upper === "GBP") return "£"
  if (upper === "AED") return "AED"
  if (upper === "QAR") return "QAR"
  if (upper === "SAR") return "SAR"
  if (upper === "KWD") return "KWD"
  if (upper === "OMR") return "OMR"
  if (upper === "BHD") return "BHD"
  return currencyCode
}

