/**
 * TrackParcel API Integration for MotoClub
 * Multi-carrier parcel tracking via TrackParcel (https://www.trackparcel.in/api-docs)
 * Supports 238+ carriers including Trackon, Gokulam Speed & Safe, Delhivery, DTDC, India Post, etc.
 */

export const TRACKPARCEL_CARRIER_MAP: Record<string, string> = {
  // Trackon Courier
  trackon: "trackon",
  "trackon courier": "trackon",

  // Gokulam Speed & Safe
  gokulam: "gokulam",
  "gokulam speed & safe": "gokulam",
  "gokulam speed n safe": "gokulam",
  "speed & safe": "gokulam",
  "speed and safe": "gokulam",
  "speed n safe": "gokulam",

  // DTDC
  dtdc: "dtdc",
  "dtdc courier": "dtdc",

  // Delhivery
  delhivery: "delhivery",

  // India Post / Speed Post
  "speed post": "indiapost",
  speedpost: "indiapost",
  "india post": "indiapost",
  indiapost: "indiapost",

  // ST Courier
  "st courier": "stcourier",
  stcourier: "stcourier",

  // Blue Dart
  "blue dart": "bluedart",
  bluedart: "bluedart",

  // Xpressbees
  xpressbees: "xpressbees",

  // Shadowfax
  shadowfax: "shadowfax",

  // Ekart / Flipkart
  ekart: "ekart",
  "ekart / flipkart": "ekart",

  // Shree Tirupati Courier
  "tirupati courier": "tirupati-courier",
  tirupati: "tirupati-courier",
  "shree tirupati": "tirupati-courier",

  // Shree Maruti
  "shree maruti": "shree-maruti",
  shreemaruti: "shree-maruti",

  // Allcargo Gati
  "allcargo gati": "allcargo-gati",
  gati: "allcargo-gati",

  // Safexpress
  safexpress: "safexpress",

  // VRL Logistics
  "vrl logistics": "vrl-logistics",
  vrl: "vrl-logistics",

  // Shiprocket
  shiprocket: "shiprocket",

  // The Professional Courier
  professional: "the-professional-courier",
  "the professional courier": "the-professional-courier",
  tpc: "the-professional-courier",

  // Ecom Express
  "ecom express": "ecom-express",
  ecom: "ecom-express",

  // Other carriers
  "kerry indev": "kerry-indev",
  smartr: "smartr",
  "anjani courier": "anjani-courier",
  anjani: "anjani-courier",
}

export const CARRIER_DISPLAY_NAMES: Record<string, string> = {
  trackon: "Trackon Courier",
  gokulam: "Gokulam Speed & Safe",
  dtdc: "DTDC",
  delhivery: "Delhivery",
  indiapost: "India Post",
  bluedart: "Blue Dart",
  stcourier: "ST Courier",
  xpressbees: "Xpressbees",
  shadowfax: "Shadowfax",
  ekart: "Ekart / Flipkart",
  "the-professional-courier": "The Professional Courier",
  "ecom-express": "Ecom Express",
  safexpress: "Safexpress",
  "allcargo-gati": "Allcargo Gati",
  "vrl-logistics": "VRL Logistics",
  shiprocket: "Shiprocket",
  "shree-maruti": "Shree Maruti",
  "tirupati-courier": "Tirupati Courier",
  "anjani-courier": "Anjani Courier",
  "kerry-indev": "Kerry Indev",
  smartr: "Smartr",
}

export function getCarrierDisplayName(slugOrName?: string | null): string {
  if (!slugOrName) return "Standard Courier"
  const clean = slugOrName.toLowerCase().trim()
  return CARRIER_DISPLAY_NAMES[clean] || slugOrName
}

export interface TrackParcelBookingDetails {
  tracking_number?: string
  status?: string
  origin?: string
  destination?: string
  actual_delivery?: string | null
  expected_delivery?: string | null
  recipient?: string | null
  date_of_delivery?: string | null
  time_of_delivery?: string | null
  pickup_date?: string | null
  service?: string | null
  weight?: string | null
}

export interface TrackParcelCheckpoint {
  date?: string
  time?: string
  location?: string
  activity?: string
  remarks?: string
}

export interface TrackParcelResponse {
  success: boolean
  courier?: string
  detectedCarrier?: string
  fromCache?: boolean
  cachedAt?: number
  cacheExpiresIn?: number
  data?: {
    booking_details?: TrackParcelBookingDetails
    tracking_details?: TrackParcelCheckpoint[]
  }
  error?: {
    code?: string
    message?: string
  }
  message?: string
}

export interface NormalizedTimelineEvent {
  status: string
  title: string
  activity: string
  date: string
  location?: string
  courierName?: string
}

export interface NormalizedTrackingResult {
  success: boolean
  isDelivered: boolean
  deliveryStatus: string
  courierServiceName: string
  trackingId: string
  currentLocation: string
  destination: string
  origin?: string | null
  expectedDelivery?: string | null
  additionalInfo?: string | null
  lastUpdate: string
  timeline: NormalizedTimelineEvent[]
  hasLiveCheckpoints: boolean
}

/**
 * In-memory TTL cache to protect against rapid reloads and respect TrackParcel rate limits
 * (250 calls trial quota, 10 requests per minute)
 */
interface CacheEntry {
  timestamp: number
  result: { success: boolean; data?: TrackParcelResponse; error?: string }
}
const MEMORY_CACHE = new Map<string, CacheEntry>()
const MEMORY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes for valid responses
const NEGATIVE_CACHE_TTL = 3 * 60 * 1000 // 3 minutes for failed / not found responses

/**
 * Format date & time into user-friendly format e.g. "26 Oct 2026 • 11:38 AM"
 */
export function formatCheckpointDateTime(dateStr?: string, timeStr?: string): string {
  if (!dateStr && !timeStr) return "Recent Update"

  let formattedDate = ""
  if (dateStr) {
    const cleanDate = dateStr.trim()
    try {
      const parts = cleanDate.split(/[-/ ]/)
      if (parts.length === 3) {
        let year = parseInt(parts[0], 10)
        let month = parseInt(parts[1], 10)
        let day = parseInt(parts[2], 10)

        // If DD-MM-YYYY format
        if (parts[0].length <= 2 && parts[2].length === 4) {
          day = parseInt(parts[0], 10)
          month = parseInt(parts[1], 10)
          year = parseInt(parts[2], 10)
        }

        const dateObj = new Date(year, month - 1, day)
        if (!isNaN(dateObj.getTime())) {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
          formattedDate = `${day.toString().padStart(2, "0")} ${months[dateObj.getMonth()]} ${year}`
        }
      }
    } catch {
      // fallback
    }
    if (!formattedDate) {
      formattedDate = dateStr.replace(/-/g, " ").trim()
    }
  }

  const cleanTime = (timeStr || "").trim()
  // Carrier time fields may contain runsheet/docket codes (e.g. DCOKH2610260954). Only parse if contains colon
  if (!cleanTime || !cleanTime.includes(":")) {
    return formattedDate || "Recent Update"
  }

  const timeParts = cleanTime.split(":")
  if (timeParts.length >= 2) {
    const hours = parseInt(timeParts[0], 10)
    const minutes = timeParts[1].substring(0, 2)
    if (!isNaN(hours)) {
      const ampm = hours >= 12 ? "PM" : "AM"
      const h12 = hours % 12 || 12
      return `${formattedDate} • ${h12.toString().padStart(2, "0")}:${minutes} ${ampm}`
    }
  }

  return `${formattedDate} • ${cleanTime}`
}

/**
 * Resolve TrackParcel carrier name from courier service name or tracking ID format
 */
export function resolveTrackParcelCarrier(
  courierName?: string | null,
  trackingId?: string | null
): { carrier: string | null; isInternalOrDirect: boolean } {
  const cleanName = (courierName || "").toLowerCase().trim()
  const cleanId = (trackingId || "").trim().toUpperCase()

  // 1. Check if internal Job Card (DOD...) or local direct handover
  if (cleanId.startsWith("DOD") || cleanName.includes("direct")) {
    return { carrier: null, isInternalOrDirect: true }
  }

  // 2. Check if courierName matches a supported carrier in map
  for (const [key, carrier] of Object.entries(TRACKPARCEL_CARRIER_MAP)) {
    if (cleanName.includes(key)) {
      return { carrier, isInternalOrDirect: false }
    }
  }

  // 3. Fallback: Auto-detect carrier from Tracking ID format
  if (cleanId) {
    // Speed Post / India Post: e.g. EE123456789IN, EK...IN
    if (/^[A-Z]{2}\d{9}IN$/.test(cleanId)) {
      return { carrier: "indiapost", isInternalOrDirect: false }
    }

    // Shadowfax: SF followed by digits
    if (/^SF\d+$/i.test(cleanId)) {
      return { carrier: "shadowfax", isInternalOrDirect: false }
    }

    // Ekart / Flipkart: FMPP, OD, EKART
    if (/^(FMPP|OD|EKART)\w+$/i.test(cleanId)) {
      return { carrier: "ekart", isInternalOrDirect: false }
    }

    // DTDC: Starts with letter (D, B, Z, P, K, V) followed by 8-9 digits e.g. D48291047
    if (/^[DBZPKV]\d{8,9}$/.test(cleanId)) {
      return { carrier: "dtdc", isInternalOrDirect: false }
    }

    // Gokulam Speed & Safe: M + 8-9 digits (M900321531) OR 8 pure numeric digits (24425631, 23677886)
    if (/^M\d{8,9}$/.test(cleanId) || /^\d{8}$/.test(cleanId)) {
      return { carrier: "gokulam", isInternalOrDirect: false }
    }

    // Delhivery: 13 to 14 numeric digits (e.g. 1234567890123)
    if (/^\d{13,14}$/.test(cleanId)) {
      return { carrier: "delhivery", isInternalOrDirect: false }
    }

    // Blue Dart / ST Courier: 11 numeric digits (e.g. 77123456789)
    if (/^\d{11}$/.test(cleanId)) {
      if (cleanName.includes("st")) return { carrier: "stcourier", isInternalOrDirect: false }
      return { carrier: "bluedart", isInternalOrDirect: false }
    }

    // Trackon: 10 or 12 numeric digits (e.g. 500692259123)
    if (/^\d{10}$/.test(cleanId) || /^\d{12}$/.test(cleanId)) {
      if (cleanName.includes("delhivery")) return { carrier: "delhivery", isInternalOrDirect: false }
      return { carrier: "trackon", isInternalOrDirect: false }
    }

    // General DTDC alphanumeric fallback
    if (/^[A-Z][0-9A-Z]{7,10}$/.test(cleanId) && !cleanId.startsWith("DOD")) {
      return { carrier: "dtdc", isInternalOrDirect: false }
    }
  }

  // 4. If a custom carrier name was provided (and not internal Job Card/direct), pass it through
  if (cleanName && cleanName.length >= 3 && !cleanName.includes("direct") && !cleanName.includes("local")) {
    return { carrier: cleanName, isInternalOrDirect: false }
  }

  return { carrier: null, isInternalOrDirect: false }
}

/**
 * Fetch tracking details from TrackParcel API with in-memory caching and rate-limiting safeguards
 */
export async function fetchFromTrackParcel(
  carrier: string,
  trackingNumber: string
): Promise<{ success: boolean; data?: TrackParcelResponse; error?: string; fromCache?: boolean }> {
  const apiKey = process.env.TRACKPARCEL_API_KEY?.trim()
  if (!apiKey) {
    return { success: false, error: "TRACKPARCEL_API_KEY is not configured" }
  }

  const cleanCarrier = carrier.trim().toLowerCase()
  const cleanAwb = trackingNumber.trim()
  if (!cleanCarrier || !cleanAwb) {
    return { success: false, error: "Carrier and AWB number are required" }
  }

  // Check in-memory cache
  const cacheKey = `${cleanCarrier}:${cleanAwb.toUpperCase()}`
  const cached = MEMORY_CACHE.get(cacheKey)
  if (cached) {
    const isError = !cached.result.success
    const ttl = isError ? NEGATIVE_CACHE_TTL : MEMORY_CACHE_TTL
    if (Date.now() - cached.timestamp < ttl) {
      return { ...cached.result, fromCache: true }
    }
  }

  try {
    const url = `https://www.trackparcel.in/api/v1/track?awb=${encodeURIComponent(cleanAwb)}&carrier=${encodeURIComponent(cleanCarrier)}`
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      if (res.status === 429) {
        console.warn("TrackParcel rate limit reached (10 requests/min).")
        const rateLimitErr = { success: false, error: "TrackParcel rate limit reached (max 10 requests/min). Please try again shortly." }
        MEMORY_CACHE.set(cacheKey, { timestamp: Date.now(), result: rateLimitErr })
        return rateLimitErr
      }

      const errText = await res.text().catch(() => "")
      console.warn(`TrackParcel API HTTP ${res.status}:`, errText)
      const resObj = { success: false, error: `TrackParcel API HTTP ${res.status}` }
      MEMORY_CACHE.set(cacheKey, { timestamp: Date.now(), result: resObj })
      return resObj
    }

    const json: TrackParcelResponse = await res.json()
    if (!json.success || !json.data) {
      const errMsg = json.error?.message || json.message || "Failed to retrieve tracking data from TrackParcel"
      const resObj = { success: false, error: errMsg }
      MEMORY_CACHE.set(cacheKey, { timestamp: Date.now(), result: resObj })
      return resObj
    }

    const resObj = { success: true, data: json }
    MEMORY_CACHE.set(cacheKey, { timestamp: Date.now(), result: resObj })
    return resObj
  } catch (err: any) {
    console.error("fetchFromTrackParcel error:", err)
    return { success: false, error: err.message || "Network error querying TrackParcel" }
  }
}

/**
 * Normalize TrackParcel response into MotoClub timeline format
 */
export function normalizeTrackParcelResponse(
  raw: TrackParcelResponse,
  sale: {
    id: number
    shipping_city?: string | null
    shipping_district?: string | null
    shipping_state?: string | null
    shipping_pincode?: string | null
  },
  trackingId: string,
  carrierSlugOrName: string
): NormalizedTrackingResult {
  const booking = raw.data?.booking_details
  const checkpoints = Array.isArray(raw.data?.tracking_details) ? raw.data!.tracking_details! : []

  const destinationParts = [
    sale.shipping_city,
    sale.shipping_district,
    sale.shipping_state,
    sale.shipping_pincode,
  ].filter(Boolean)
  const destination = destinationParts.join(", ") || booking?.destination || "Customer Address"

  const statusRaw = (booking?.status || "").toLowerCase().trim()
  const isOutForDelivery = statusRaw.includes("out for delivery") || statusRaw.includes("with delivery agent")
  const isDelivered = !isOutForDelivery && (statusRaw.includes("delivered") || (statusRaw.includes("deliver") && !statusRaw.includes("undeliver")))

  let deliveryStatus = "In Transit"
  if (isDelivered) {
    deliveryStatus = "Delivered"
  } else if (isOutForDelivery || statusRaw.includes("out")) {
    deliveryStatus = "Out for Delivery"
  } else if (statusRaw.includes("return") || statusRaw.includes("rto")) {
    deliveryStatus = "Returned"
  } else if (statusRaw.includes("fail") || statusRaw.includes("unattempt") || statusRaw.includes("undeliver")) {
    deliveryStatus = "Undelivered"
  } else if (statusRaw.includes("book") || statusRaw.includes("picked") || statusRaw.includes("manifest")) {
    deliveryStatus = "Booked"
  } else if (booking?.status) {
    deliveryStatus = booking.status
  }

  const detectedCarrier = raw.detectedCarrier || raw.courier || carrierSlugOrName
  const courierDisplayName = getCarrierDisplayName(detectedCarrier)

  const timeline: NormalizedTimelineEvent[] = []
  let hasLiveCheckpoints = false

  for (const cp of checkpoints) {
    const activity = (cp.activity || "").trim()
    if (!activity) continue

    const actLower = activity.toLowerCase()
    if (
      actLower.includes("no shipment found") ||
      actLower.includes("no information present") ||
      actLower.includes("invalid tracking")
    ) {
      continue
    }

    hasLiveCheckpoints = true
    let itemStatus = "In Transit"
    if (actLower.includes("out for delivery") || actLower.includes("with delivery agent")) {
      itemStatus = "Out for Delivery"
    } else if (actLower.includes("delivered") || (actLower.includes("deliver") && !actLower.includes("undeliver"))) {
      itemStatus = "Delivered"
    } else if (actLower.includes("pickup") || actLower.includes("picked") || actLower.includes("booked")) {
      itemStatus = "Booked"
    }

    const narrative = cp.remarks ? `${activity} (${cp.remarks})` : activity

    timeline.push({
      status: itemStatus,
      title: activity,
      activity: narrative,
      date: formatCheckpointDateTime(cp.date, cp.time),
      location: cp.location || undefined,
      courierName: courierDisplayName,
    })
  }

  // Ensure newest event is first in timeline (index 0)
  if (timeline.length > 1) {
    const firstAct = (timeline[0].title || timeline[0].activity || "").toLowerCase()
    const lastAct = (timeline[timeline.length - 1].title || timeline[timeline.length - 1].activity || "").toLowerCase()
    if (
      (firstAct.includes("booked") || firstAct.includes("picked up") || firstAct.includes("manifest")) &&
      (lastAct.includes("deliver") || lastAct.includes("out for delivery") || lastAct.includes("arrived"))
    ) {
      timeline.reverse()
    }
  }

  const lastUpdate = timeline[0]?.date || formatCheckpointDateTime(booking?.actual_delivery || booking?.date_of_delivery || undefined)

  return {
    success: true,
    isDelivered,
    deliveryStatus,
    courierServiceName: courierDisplayName,
    trackingId,
    currentLocation: timeline[0]?.location || (isDelivered ? destination : "In Transit"),
    destination,
    origin: booking?.origin || "MotoClub Store",
    expectedDelivery: booking?.expected_delivery || null,
    additionalInfo: booking?.recipient ? `Delivered to: ${booking.recipient}` : null,
    lastUpdate,
    timeline,
    hasLiveCheckpoints: hasLiveCheckpoints && timeline.length > 0,
  }
}
