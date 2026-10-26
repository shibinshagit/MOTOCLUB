import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { generateCourierTrackingUrl } from "@/lib/shipping/tracking-url"
import {
  resolveTrackParcelCarrier,
  fetchFromTrackParcel,
  normalizeTrackParcelResponse,
  getCarrierDisplayName,
} from "@/lib/shipping/trackparcel"
import { format } from "date-fns"

function safeFormatDate(input: any, defaultStr = "dd MMM yyyy, hh:mm a"): string {
  if (!input) return format(new Date(), defaultStr)
  try {
    const d = input instanceof Date ? input : new Date(input)
    if (isNaN(d.getTime())) return format(new Date(), defaultStr)
    return format(d, defaultStr)
  } catch {
    return format(new Date(), defaultStr)
  }
}

function parseCachedPayload(payload: any): any {
  if (!payload) return null
  let data = payload
  if (typeof data === "string") {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (typeof data === "string") {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  return data && typeof data === "object" ? data : null
}


export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token?.trim()
    if (!rawToken) {
      return NextResponse.json({ success: false, message: "Token is required" }, { status: 400 })
    }

    // Match by tracking_token, tracking_id, or numeric order id (guard against 32-bit integer overflow)
    const cleanToken = rawToken.trim()
    const isPureOrderNumber = /^#?\d+$/.test(cleanToken)
    const parsedSaleId = isPureOrderNumber ? parseInt(cleanToken.replace(/^#/, ""), 10) : 0
    const saleIdQuery = parsedSaleId > 0 && parsedSaleId <= 2147483647 ? parsedSaleId : 0

    const rows = await sql`
      SELECT 
        s.id,
        s.sale_type,
        s.delivery_status,
        s.tracking_id,
        s.courier_service_name,
        s.shipping_address,
        s.shipping_street,
        s.shipping_landmark,
        s.shipping_city,
        s.shipping_district,
        s.shipping_state,
        s.shipping_pincode,
        s.customer_address,
        s.total_amount,
        s.payment_status,
        s.payment_method,
        s.customer_name_override,
        s.customer_phone_override,
        s.shipped_at,
        s.delivered_at,
        s.created_at,
        s.updated_at,
        s.tracking_token,
        s.courier_partner_id,
        s.tracking_cache_payload,
        s.tracking_last_polled_at,
        EXTRACT(EPOCH FROM (NOW() - s.tracking_last_polled_at)) / 60 as tracking_age_minutes,
        s.is_tracking_frozen,
        COALESCE(s.customer_name_override, c.name, '') as customer_name,
        COALESCE(s.customer_phone_override, c.phone, '') as customer_phone,
        md.name as master_courier_name,
        md.tracking_url_template,
        st.name as partner_staff_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN master_data md ON md.id = s.courier_service_id OR md.id = s.courier_partner_id
      LEFT JOIN staff st ON st.id = s.courier_partner_id
      WHERE s.tracking_token = ${cleanToken}
         OR s.tracking_id = ${cleanToken}
         OR (${saleIdQuery > 0} AND s.id = ${saleIdQuery})
      LIMIT 1
    `

    if (rows.length === 0) {
      // Direct AWB query via TrackParcel
      const { carrier: tpCarrier } = resolveTrackParcelCarrier(null, cleanToken)
      if (tpCarrier && process.env.TRACKPARCEL_API_KEY) {
        const tpRes = await fetchFromTrackParcel(tpCarrier, cleanToken)
        if (tpRes.success && tpRes.data) {
          const normalized = normalizeTrackParcelResponse(tpRes.data, { id: 0 }, cleanToken, tpCarrier)
          if (normalized.hasLiveCheckpoints) {
            return NextResponse.json({
              success: true,
              data: {
                version: 2,
                orderId: cleanToken,
                deliveryStatus: normalized.deliveryStatus,
                trackingId: cleanToken,
                courierPartnerName: normalized.courierServiceName,
                courierServiceName: normalized.courierServiceName,
                courierTrackingUrl: generateCourierTrackingUrl(tpCarrier, cleanToken),
                currentLocation: normalized.currentLocation,
                destination: normalized.destination,
                origin: normalized.origin || null,
                expectedDelivery: normalized.expectedDelivery,
                additionalInfo: normalized.additionalInfo,
                customerName: "",
                contact: "",
                totalAmount: null,
                paymentStatus: null,
                paymentMethod: null,
                items: [],
                lastUpdate: normalized.lastUpdate,
                timeline: normalized.timeline,
              },
              source: "trackparcel_direct_query",
            })
          }
        }
      }

      // Recognized carrier format, but carrier has not yet logged physical scans
      if (tpCarrier) {
        const displayName = getCarrierDisplayName(tpCarrier)
        return NextResponse.json({
          success: true,
          data: {
            version: 2,
            orderId: cleanToken,
            deliveryStatus: "Pending First Scan",
            trackingId: cleanToken,
            courierPartnerName: displayName,
            courierServiceName: displayName,
            courierTrackingUrl: generateCourierTrackingUrl(tpCarrier, cleanToken),
            currentLocation: "Awaiting First Scan",
            destination: "Delivery Destination",
            origin: "Origin Facility",
            expectedDelivery: null,
            additionalInfo: `Tracking number recognized as ${displayName}. Physical checkpoint scans have not been reported yet.`,
            customerName: "",
            contact: "",
            totalAmount: null,
            paymentStatus: null,
            paymentMethod: null,
            items: [],
            lastUpdate: "Awaiting Scan",
            timeline: [
              {
                status: "Pending",
                title: "Awaiting Carrier Scan",
                activity: `Consignment number is recognized as ${displayName}, but no physical transit checkpoints have been logged in the carrier network yet. You can track directly on the official portal.`,
                date: "Pending Update",
                courierName: displayName,
              },
            ],
          },
          source: "direct_courier_query_pending",
        })
      }

      return NextResponse.json({ success: false, message: "Shipment not found" }, { status: 404 })
    }

    const sale = rows[0]
    const courierServiceName = sale.courier_service_name || sale.master_courier_name || "Standard Courier"
    const courierPartnerName = sale.partner_staff_name || sale.master_courier_name || courierServiceName
    const trackingId = (sale.tracking_id || "").trim()

    const courierTrackingUrl = generateCourierTrackingUrl(
      courierServiceName,
      trackingId,
      sale.tracking_url_template
    )

    // Fetch order items to enrich shipment details
    const saleItems = await sql`
      SELECT si.quantity, si.price, COALESCE(p.name, 'Product') as product_name
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ${sale.id}
    `

    // Compile authentic full address
    const addressParts = [
      sale.shipping_street,
      sale.shipping_landmark,
      sale.shipping_city,
      sale.shipping_district,
      sale.shipping_state,
      sale.shipping_pincode ? `PIN: ${sale.shipping_pincode}` : null,
    ].filter(Boolean)
    const formattedDestination = addressParts.length > 0
      ? addressParts.join(", ")
      : sale.shipping_address || sale.customer_address || "Customer Address"

    // ========================================================
    // GUARDRAIL 1: Freeze "Delivered" Tracking IDs Permanently (0 external API calls)
    // ========================================================
    const isAlreadyDelivered = Boolean(
      sale.is_tracking_frozen ||
      sale.delivery_status?.toLowerCase() === "delivered" ||
      sale.delivery_status?.toLowerCase() === "completed"
    )

    const cachedData = parseCachedPayload(sale.tracking_cache_payload)

    if (isAlreadyDelivered && cachedData) {
      const isV2Cache = cachedData.version === 2 && !cachedData.timeline?.[0]?.from
      if (isV2Cache) {
        cachedData.courierTrackingUrl = courierTrackingUrl || cachedData.courierTrackingUrl
        return NextResponse.json({ success: true, data: cachedData, source: "database_frozen" })
      }
    }

    // ========================================================
    // GUARDRAIL 2: Aggressive Caching (TTL: 45 Minutes for active shipments)
    // ========================================================
    const CACHE_TTL_MINUTES = 45
    const ageMinutes =
      sale.tracking_age_minutes !== null && sale.tracking_age_minutes !== undefined
        ? Number(sale.tracking_age_minutes)
        : Infinity

    if (cachedData && !isNaN(ageMinutes) && ageMinutes < CACHE_TTL_MINUTES) {
      const isV2Cache = cachedData.version === 2 && !cachedData.timeline?.[0]?.from
      if (isV2Cache) {
        cachedData.courierTrackingUrl = courierTrackingUrl || cachedData.courierTrackingUrl
        return NextResponse.json({ success: true, data: cachedData, source: "database_cache" })
      }
    }

    // ========================================================
    // TrackParcel API (Multi-carrier external tracking)
    // ========================================================
    const { carrier: tpCarrier, isInternalOrDirect } = resolveTrackParcelCarrier(courierServiceName, trackingId)

    if (!isInternalOrDirect && tpCarrier && trackingId && process.env.TRACKPARCEL_API_KEY) {
      const tpRes = await fetchFromTrackParcel(tpCarrier, trackingId)

      if (tpRes.success && tpRes.data) {
        const normalized = normalizeTrackParcelResponse(tpRes.data, sale, trackingId, tpCarrier)

        if (normalized.hasLiveCheckpoints) {
          const destinationToUse =
            formattedDestination !== "Customer Address"
              ? formattedDestination
              : normalized.destination || formattedDestination

          const liveData = {
            version: 2,
            orderId: `#${sale.id}`,
            deliveryStatus: normalized.deliveryStatus,
            trackingId,
            courierPartnerName,
            courierServiceName: normalized.courierServiceName,
            courierTrackingUrl,
            currentLocation: normalized.currentLocation,
            destination: destinationToUse,
            origin: normalized.origin || "MotoClub Store",
            expectedDelivery: normalized.expectedDelivery,
            additionalInfo: normalized.additionalInfo,
            customerName: sale.customer_name || "",
            contact: sale.customer_phone || "",
            totalAmount: sale.total_amount ? Number(sale.total_amount).toFixed(2) : null,
            paymentStatus: sale.payment_status || "Pending",
            paymentMethod: sale.payment_method || null,
            items: saleItems.map((it: any) => ({
              name: it.product_name,
              quantity: Number(it.quantity) || 1,
              price: it.price ? Number(it.price).toFixed(2) : null,
            })),
            lastUpdate: normalized.lastUpdate,
            timeline: normalized.timeline,
          }

          const isNowDelivered = normalized.isDelivered || normalized.deliveryStatus === "Delivered"

          // Save payload and freeze if delivered
          try {
            const jsonPayload = typeof sql.json === "function" ? sql.json(liveData) : JSON.stringify(liveData)
            await sql`
              UPDATE sales
              SET
                tracking_cache_payload = ${jsonPayload},
                tracking_last_polled_at = NOW(),
                delivery_status = CASE WHEN ${isNowDelivered} THEN 'Delivered' ELSE delivery_status END,
                delivered_at = CASE WHEN ${isNowDelivered} AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
                is_tracking_frozen = ${isNowDelivered}
              WHERE id = ${sale.id}
            `
          } catch (dbErr) {
            console.warn("Failed to update tracking cache in sales table:", dbErr)
          }

          return NextResponse.json({ success: true, data: liveData, source: "trackparcel_live" })
        }
      }
    }

    // ========================================================
    // Internal MotoClub Fallback Timeline (Local Courier, Pre-scan, or Offline)
    // ========================================================
    const isA1Parcel = (sale.courier_service_name || "").toLowerCase().includes("a1 parcel")

    const trackingEventsRows = await sql`
      SELECT status, location, description, event_at
      FROM tracking_events
      WHERE sale_id = ${sale.id}
      ORDER BY event_at DESC
    `

    const isDelivered =
      sale.delivery_status?.toLowerCase() === "delivered" ||
      sale.delivery_status?.toLowerCase() === "completed" ||
      Boolean(sale.delivered_at)

    const isShipped =
      Boolean(sale.shipped_at) ||
      Boolean(trackingId) ||
      sale.delivery_status?.toLowerCase().includes("transit") ||
      sale.delivery_status?.toLowerCase().includes("ship") ||
      sale.delivery_status?.toLowerCase().includes("out")

    const timeline = []

    // 1. Delivered milestone (if delivered)
    if (isDelivered) {
      timeline.push({
        status: "Delivered",
        title: "Delivered",
        activity: "Shipment successfully delivered to recipient.",
        date: safeFormatDate(sale.delivered_at || sale.updated_at),
        location: sale.shipping_city || formattedDestination,
        courierName: courierServiceName,
      })
    }

    // 2. Out for delivery (if status explicitly set)
    if (sale.delivery_status?.toLowerCase().includes("out")) {
      timeline.push({
        status: "Out for Delivery",
        title: "Out for Delivery",
        activity: "Package is out for delivery with local courier executive.",
        date: safeFormatDate(sale.updated_at),
        location: sale.shipping_city || formattedDestination,
        courierName: courierServiceName,
      })
    }

    // 3. Custom events from tracking_events table
    for (const row of trackingEventsRows) {
      timeline.push({
        status: row.status,
        title: row.status,
        activity: row.description || `Shipment update: ${row.status}`,
        date: safeFormatDate(row.event_at),
        location: row.location || undefined,
        courierName: courierServiceName,
      })
    }

    // 4. Dispatched to Courier
    if (isShipped && !timeline.some((e: any) => e.title.toLowerCase().includes("dispatch") || e.title.toLowerCase().includes("shipped"))) {
      timeline.push({
        status: "In Transit",
        title: "Dispatched to Courier",
        activity: `Handed over to ${courierServiceName}${trackingId ? ` (AWB: ${trackingId})` : ""} for delivery.`,
        date: safeFormatDate(sale.shipped_at || sale.created_at),
        location: "MotoClub Store",
        courierName: courierServiceName,
      })
    }

    // 5. Order Placed
    timeline.push({
      status: "Booked",
      title: "Order Placed",
      activity: "Order confirmed and verified at MotoClub store.",
      date: safeFormatDate(sale.created_at),
      location: "MotoClub Store",
      courierName: undefined,
    })

    let fallbackCurrentLocation = "MotoClub Store"
    if (isDelivered) {
      fallbackCurrentLocation = sale.shipping_city || formattedDestination
    } else if (isShipped) {
      fallbackCurrentLocation = `In Transit (${courierServiceName})`
    }

    const fallbackData = {
      version: 2,
      orderId: `#${sale.id}`,
      deliveryStatus: sale.delivery_status || (isDelivered ? "Delivered" : isShipped ? "In Transit" : "Order Placed"),
      trackingId,
      courierPartnerName,
      courierServiceName,
      courierTrackingUrl,
      currentLocation: fallbackCurrentLocation,
      destination: formattedDestination,
      origin: "MotoClub Store",
      expectedDelivery: null,
      additionalInfo: null,
      customerName: sale.customer_name || "",
      contact: sale.customer_phone || "",
      totalAmount: sale.total_amount ? Number(sale.total_amount).toFixed(2) : null,
      paymentStatus: sale.payment_status || "Pending",
      paymentMethod: sale.payment_method || null,
      items: saleItems.map((it: any) => ({
        name: it.product_name,
        quantity: Number(it.quantity) || 1,
        price: it.price ? Number(it.price).toFixed(2) : null,
      })),
      lastUpdate: safeFormatDate(sale.updated_at || sale.created_at),
      timeline,
    }

    // Cache fallback data for 15 minutes to prevent rapid reload spam
    try {
      const fallbackPayload = typeof sql.json === "function" ? sql.json(fallbackData) : JSON.stringify(fallbackData)
      await sql`
        UPDATE sales
        SET
          tracking_cache_payload = ${fallbackPayload},
          tracking_last_polled_at = NOW()
        WHERE id = ${sale.id}
          AND tracking_cache_payload IS NULL
      `
    } catch (e) {
      // non-fatal
    }

    return NextResponse.json({
      success: true,
      data: fallbackData,
      source: isA1Parcel ? "a1_parcel_fallback" : "internal_database",
    })
  } catch (error: any) {
    console.error("GET /api/track/[token] error:", error)
    return NextResponse.json({ success: false, message: error?.message || "Internal server error" }, { status: 500 })
  }
}
