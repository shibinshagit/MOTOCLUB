/**
 * TrackCourier.io API Integration for MotoClub
 * Provides multi-carrier tracking (DTDC, Delhivery, Trackon, ST Courier, BlueDart, India Post, etc.)
 * with caching and automatic delivery freezing.
 */

export const COURIER_SLUG_MAP: Record<string, string> = {
  dtdc: "dtdc",
  delhivery: "delhivery",
  trackon: "trackon",
  "st courier": "stcourier",
  stcourier: "stcourier",
  "blue dart": "bluedart",
  bluedart: "bluedart",
  professional: "professional",
  "the professional courier": "professional",
  tpc: "professional",
  "speed post": "speedpost",
  speedpost: "speedpost",
  "india post": "indiapost",
  indiapost: "indiapost",
  xpressbees: "xpressbees",
  shadowfax: "shadowfax",
  ekart: "ekart",
  "shree maruti": "shreemaruti",
  shreemaruti: "shreemaruti",
  "shree tirupati": "shreetirupati",
  shreetirupati: "shreetirupati",
  safexpress: "safexpress",
  gati: "gati",
  vrl: "vrl",
  skyking: "skyking",
}

export interface TrackCourierCheckpoint {
  Activity?: string
  CheckpointState?: string
  CourierName?: string
  Date?: string
  Location?: string
  Time?: string
}

export interface TrackCourierRawData {
  Checkpoints?: TrackCourierCheckpoint[]
  ShipmentState?: string
  MostRecentStatus?: string
  CourierHasNoRecordOfShipment?: boolean
  DestinationCity?: string
  OriginCity?: string
  ExpectedDeliveryDate?: string
  AdditionalInfo?: string
  ExecutionTime?: string
  FetchTime?: string
  Result?: string
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
  mostRecentStatus?: string | null
  lastUpdate: string
  timeline: NormalizedTimelineEvent[]
  rawPayload?: any
  isA1Parcel?: boolean
  hasLiveCheckpoints: boolean
}

/**
 * Format checkpoint date and 24h time into user-friendly "25 Feb 2025 • 04:51 PM"
 */
export function formatCheckpointDateTime(dateStr?: string, timeStr?: string): string {
  if (!dateStr && !timeStr) return "Recent Update"
  const cleanDate = (dateStr || "").replace(/-/g, " ").trim()
  if (!timeStr) return cleanDate

  const timeParts = timeStr.trim().split(":")
  if (timeParts.length >= 2) {
    const hours = parseInt(timeParts[0], 10)
    const minutes = timeParts[1]
    if (!isNaN(hours)) {
      const ampm = hours >= 12 ? "PM" : "AM"
      const h12 = hours % 12 || 12
      return `${cleanDate} • ${h12.toString().padStart(2, "0")}:${minutes} ${ampm}`
    }
  }
  return `${cleanDate} • ${timeStr}`
}

/**
 * Resolve courier slug or auto-detect from tracking number
 */
export function resolveCourierSlug(
  courierName?: string | null,
  trackingId?: string | null
): { slug: string | null; isA1Parcel: boolean } {
  const cleanName = (courierName || "").toLowerCase().trim()
  const cleanId = (trackingId || "").trim().toUpperCase()

  // 1. Check if A1 Parcel
  if (cleanName.includes("a1 parcel") || cleanName.includes("a1parcel")) {
    return { slug: null, isA1Parcel: true }
  }

  // 2. Check if courierName matches a supported slug
  for (const [key, slug] of Object.entries(COURIER_SLUG_MAP)) {
    if (cleanName.includes(key)) {
      return { slug, isA1Parcel: false }
    }
  }

  // 3. Fallback: Auto-detect from Tracking ID format
  if (cleanId) {
    // Speed Post / India Post: e.g. EE123456789IN, EK..., etc.
    if (/^[A-Z]{2}\d{9}IN$/.test(cleanId)) {
      return { slug: "speedpost", isA1Parcel: false }
    }

    // DTDC: Usually starts with letter (D, B, Z, P, etc.) followed by numbers/alphanumeric or starts with DOD
    if (/^[A-Z][0-9A-Z]{7,10}$/.test(cleanId) || /^DOD\d+$/i.test(cleanId)) {
      return { slug: "dtdc", isA1Parcel: false }
    }

    // Delhivery: 12 to 14 numeric digits
    if (/^\d{12,14}$/.test(cleanId)) {
      return { slug: "delhivery", isA1Parcel: false }
    }

    // Trackon / ST Courier: 10 numeric digits
    if (/^\d{10}$/.test(cleanId)) {
      if (cleanName.includes("trackon")) return { slug: "trackon", isA1Parcel: false }
      if (cleanName.includes("st")) return { slug: "stcourier", isA1Parcel: false }
      return { slug: "trackon", isA1Parcel: false }
    }
  }

  return { slug: null, isA1Parcel: false }
}

/**
 * Fetch tracking details from TrackCourier API
 */
export async function fetchFromTrackCourier(
  courierSlug: string,
  trackingNumber: string
): Promise<{ success: boolean; data?: TrackCourierRawData; error?: string }> {
  const apiKey = process.env.TRACKCOURIER_API_KEY?.trim()
  if (!apiKey) {
    return { success: false, error: "TRACKCOURIER_API_KEY is not configured" }
  }

  const cleanSlug = courierSlug.trim().toLowerCase()
  const cleanId = trackingNumber.trim()
  if (!cleanSlug || !cleanId) {
    return { success: false, error: "Courier slug and tracking number are required" }
  }

  try {
    const url = `https://api.trackcourier.io/v1/track?courier=${encodeURIComponent(cleanSlug)}&tracking_number=${encodeURIComponent(cleanId)}`
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn(`TrackCourier API HTTP ${res.status}:`, errText)
      return { success: false, error: `TrackCourier API HTTP ${res.status}` }
    }

    const json = await res.json()
    if (!json.success || !json.data) {
      return { success: false, error: json.message || "Failed to retrieve tracking data" }
    }

    return { success: true, data: json.data }
  } catch (err: any) {
    console.error("fetchFromTrackCourier network error:", err)
    return { success: false, error: err.message || "Network error querying TrackCourier" }
  }
}

/**
 * Normalize TrackCourier checkpoints into MotoClub Timeline format
 */
export function normalizeTrackCourierResponse(
  raw: TrackCourierRawData,
  sale: {
    id: number
    shipping_city?: string | null
    shipping_district?: string | null
    shipping_state?: string | null
    shipping_pincode?: string | null
    customer_phone?: string | null
    created_at?: any
    courier_service_name?: string | null
  },
  trackingId: string,
  courierSlug: string
): NormalizedTrackingResult {
  const destinationParts = [
    sale.shipping_city,
    sale.shipping_district,
    sale.shipping_state,
    sale.shipping_pincode,
  ].filter(Boolean)
  const destination = destinationParts.join(", ") || raw.DestinationCity || "Customer Address"

  const rawState = (raw.ShipmentState || "").toLowerCase().trim()
  const isDelivered = rawState === "delivered"

  let deliveryStatus = "In Transit"
  if (isDelivered) {
    deliveryStatus = "Delivered"
  } else if (rawState.includes("out")) {
    deliveryStatus = "Out for Delivery"
  } else if (rawState.includes("exception") || raw.CourierHasNoRecordOfShipment) {
    deliveryStatus = "Shipped"
  }

  const checkpoints = Array.isArray(raw?.Checkpoints) ? raw.Checkpoints : []
  const timeline: NormalizedTimelineEvent[] = []
  let hasValidLiveScans = false

  for (const cp of checkpoints) {
    const rawActivity = (cp.Activity || "").trim()
    if (!rawActivity) continue

    // Skip generic errors/no shipment found strings
    const actLower = rawActivity.toLowerCase()
    if (
      actLower.includes("no shipment found") ||
      actLower.includes("no information present") ||
      actLower.includes("invalid tracking")
    ) {
      continue
    }

    hasValidLiveScans = true
    const cpState = (cp.CheckpointState || "").toLowerCase()
    const cleanLocation = (cp.Location || "").trim().replace(/[-_]?(hub|branch)$/i, "").trim()
    
    let title = "In Transit"
    let activityDesc = rawActivity
    let mappedStatus = "In Transit"

    if (cpState === "delivered" || actLower.includes("delivered")) {
      title = "Delivered"
      mappedStatus = "Delivered"
      activityDesc = actLower === "delivered" ? "Package successfully delivered to recipient." : rawActivity
    } else if (cpState.includes("out") || actLower.includes("out for delivery")) {
      title = "Out for Delivery"
      mappedStatus = "Out for Delivery"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      } else {
        activityDesc = "Package is out for delivery with courier executive."
      }
    } else if (actLower.includes("reached at destination") || actLower.includes("reached destination")) {
      title = "Reached Destination Center"
      mappedStatus = "In Transit"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      }
    } else if (actLower.startsWith("arrived at")) {
      title = "Arrived at Processing Center"
      mappedStatus = "In Transit"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      }
    } else if (actLower.startsWith("dispatched from") || actLower.startsWith("departed")) {
      title = "Dispatched from Hub"
      mappedStatus = "In Transit"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      }
    } else if (actLower.includes("on the way") || actLower.includes("in transit")) {
      title = "In Transit"
      mappedStatus = "In Transit"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      }
    } else if (actLower.includes("booked") || cpState.includes("inforeceived")) {
      title = "Shipment Booked"
      mappedStatus = "Booked"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      } else {
        activityDesc = "Shipment recorded and booked with courier partner."
      }
    } else if (actLower.includes("pickup requested") || actLower.includes("pick up request")) {
      title = "Pickup Requested"
      mappedStatus = "Pickup"
      if (rawActivity.includes(" - ")) {
        activityDesc = rawActivity.split(" - ").slice(1).join(" - ").trim()
      }
    } else if (rawActivity.includes(" - ")) {
      const parts = rawActivity.split(" - ")
      title = parts[0].trim()
      activityDesc = parts.slice(1).join(" - ").trim()
    }

    const dateStr = formatCheckpointDateTime(cp.Date, cp.Time)

    timeline.push({
      status: mappedStatus,
      title,
      activity: activityDesc,
      date: dateStr,
      location: cleanLocation || undefined,
      courierName: cp.CourierName || cpDisplayName(courierSlug),
    })
  }

  // Find genuine current location (first checkpoint with a valid location)
  let latestLocation = raw.DestinationCity || sale.shipping_city || "In Transit"
  for (const event of timeline) {
    if (event.location) {
      latestLocation = event.location
      break
    }
  }

  // Find genuine origin (oldest checkpoint with a location)
  let origin = raw.OriginCity || null
  if (!origin) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].location) {
        origin = timeline[i].location || null
        break
      }
    }
  }

  const lastUpdate = timeline.length > 0 ? timeline[0].date : "Recently Updated"

  return {
    success: true,
    isDelivered,
    deliveryStatus,
    courierServiceName: cpDisplayName(courierSlug, sale.courier_service_name),
    trackingId,
    currentLocation: latestLocation,
    destination,
    origin,
    expectedDelivery: raw.ExpectedDeliveryDate || raw.AdditionalInfo || null,
    additionalInfo: raw.AdditionalInfo || null,
    mostRecentStatus: raw.MostRecentStatus || null,
    lastUpdate,
    timeline,
    rawPayload: raw,
    hasLiveCheckpoints: hasValidLiveScans && timeline.length > 0,
  }
}

function cpDisplayName(slug: string, fallbackName?: string | null): string {
  const displayMap: Record<string, string> = {
    dtdc: "DTDC",
    delhivery: "Delhivery",
    trackon: "Trackon",
    stcourier: "ST Courier",
    bluedart: "Blue Dart",
    professional: "Professional Courier",
    speedpost: "Speed Post",
    indiapost: "India Post",
    xpressbees: "XpressBees",
    shadowfax: "Shadowfax",
    ekart: "Ekart Logistics",
  }
  return displayMap[slug] || fallbackName || "Courier Partner"
}

export default {
  COURIER_SLUG_MAP,
  resolveCourierSlug,
  fetchFromTrackCourier,
  normalizeTrackCourierResponse,
}
