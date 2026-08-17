export function generateCourierTrackingUrl(
  courierServiceName?: string | null,
  trackingId?: string | null,
  templateUrl?: string | null,
): string | null {
  const cleanTrackingId = trackingId?.trim() || ""

  // If a master_data template URL is configured, use it
  if (templateUrl?.trim() && cleanTrackingId) {
    let url = templateUrl.trim()
    url = url.replace(/\{tracking_id\}/gi, encodeURIComponent(cleanTrackingId))
    url = url.replace(/\{trackingId\}/gi, encodeURIComponent(cleanTrackingId))
    url = url.replace(/\{awb\}/gi, encodeURIComponent(cleanTrackingId))
    return url
  }

  const nameLower = courierServiceName?.toLowerCase().trim() || ""

  if (!nameLower) return null

  // 1. Trackon
  if (nameLower.includes("trackon")) {
    return cleanTrackingId
      ? `https://trackon.in/Tracking/Search?AwbNo=${encodeURIComponent(cleanTrackingId)}`
      : "https://www.trackon.in/"
  }

  // 2. A1 Parcel
  if (nameLower.includes("a1 parcel") || nameLower.includes("a1parcel")) {
    return cleanTrackingId
      ? `https://www.a1parcel.in/tracking?awb=${encodeURIComponent(cleanTrackingId)}`
      : "https://www.a1parcel.in/tracking"
  }

  // 3. DTDC
  if (nameLower.includes("dtdc")) {
    return cleanTrackingId
      ? `https://trackcourier.io/dtdc-tracking?tracking_no=${encodeURIComponent(cleanTrackingId)}`
      : "https://trackcourier.io/dtdc-tracking"
  }

  // 4. ST Courier
  if (nameLower.includes("st courier") || nameLower.includes("stcourier")) {
    return cleanTrackingId
      ? `https://stcourier.com/track/shipment?id=${encodeURIComponent(cleanTrackingId)}`
      : "https://stcourier.com/track/shipment"
  }

  return null
}

export function getPublicTrackingUrl(tokenOrTrackingId?: string | null): string | null {
  const clean = tokenOrTrackingId?.trim()
  if (!clean) return null

  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ims.motoclub.in"

  if (typeof window !== "undefined" && window.location?.origin) {
    if (!window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1")) {
      baseUrl = window.location.origin
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "")
  return `${baseUrl}/track/${encodeURIComponent(clean)}`
}
