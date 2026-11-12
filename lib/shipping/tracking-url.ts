import { getConfiguredAppUrl, PRODUCTION_APP_URL } from "@/lib/app-url"

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
      ? `https://trackparcel.in/carrier/dtdc-tracking/?tracking_no=${encodeURIComponent(cleanTrackingId)}`
      : "https://www.dtdc.in/"
  }

  // 4. Gokulam Speed & Safe
  if (nameLower.includes("gokulam") || nameLower.includes("speed & safe") || nameLower.includes("speed and safe") || nameLower.includes("speed n safe")) {
    return cleanTrackingId
      ? `https://trackparcel.in/carrier/gokulam-speed-and-safe-courier-tracking/?tracking_no=${encodeURIComponent(cleanTrackingId)}`
      : "https://www.speedandsafe.com/"
  }

  // 5. ST Courier
  if (nameLower.includes("st courier") || nameLower.includes("stcourier")) {
    return cleanTrackingId
      ? `https://stcourier.com/track/shipment?id=${encodeURIComponent(cleanTrackingId)}`
      : "https://stcourier.com/track/shipment"
  }

  // 5. Delhivery
  if (nameLower.includes("delhivery")) {
    return cleanTrackingId
      ? `https://www.delhivery.com/track/package/${encodeURIComponent(cleanTrackingId)}`
      : "https://www.delhivery.com/"
  }

  // 6. Blue Dart
  if (nameLower.includes("blue dart") || nameLower.includes("bluedart")) {
    return cleanTrackingId
      ? `https://www.bluedart.com/tracking?handler=tnt&action=custtrack&track=true&numbers=${encodeURIComponent(cleanTrackingId)}`
      : "https://www.bluedart.com/"
  }

  // 7. India Post / Speed Post
  if (nameLower.includes("speed post") || nameLower.includes("speedpost") || nameLower.includes("india post") || nameLower.includes("indiapost")) {
    return cleanTrackingId
      ? `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`
      : "https://www.indiapost.gov.in/"
  }

  // 8. Professional Courier
  if (nameLower.includes("professional") || nameLower.includes("tpc")) {
    return cleanTrackingId
      ? `https://www.tpcindia.com/`
      : "https://www.tpcindia.com/"
  }

  return null
}

export function getPublicTrackingUrl(tokenOrTrackingId?: string | null): string | null {
  const clean = tokenOrTrackingId?.trim()
  if (!clean) return null

  const configured = getConfiguredAppUrl()
  let baseUrl = configured || PRODUCTION_APP_URL

  // Without an explicit config, follow the current host (e.g. preview deployments)
  if (!configured && typeof window !== "undefined" && window.location?.origin) {
    if (!window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1")) {
      baseUrl = window.location.origin
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "")
  return `${baseUrl}/track/${encodeURIComponent(clean)}`
}
