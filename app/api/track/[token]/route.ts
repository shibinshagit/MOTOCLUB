import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { generateCourierTrackingUrl } from "@/lib/shipping/tracking-url"
import { format } from "date-fns"

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const rawToken = params.token?.trim()
    if (!rawToken) {
      return NextResponse.json({ success: false, message: "Token is required" }, { status: 400 })
    }

    // Match by tracking_token, tracking_id, or sale id fallback
    const numericId = parseInt(rawToken.replace(/\D/g, ""), 10)
    const saleIdQuery = !isNaN(numericId) ? numericId : 0

    const rows = await sql`
      SELECT 
        s.id,
        s.sale_type,
        s.delivery_status,
        s.tracking_id,
        s.courier_service_name,
        s.shipping_address,
        s.shipping_city,
        s.shipping_district,
        s.shipping_state,
        s.shipping_pincode,
        s.shipped_at,
        s.delivered_at,
        s.created_at,
        s.updated_at,
        s.tracking_token,
        s.courier_partner_id,
        md.name as master_courier_name,
        md.tracking_url_template,
        st.name as partner_staff_name
      FROM sales s
      LEFT JOIN master_data md ON md.id = s.courier_service_id OR md.id = s.courier_partner_id
      LEFT JOIN staff st ON st.id = s.courier_partner_id
      WHERE s.tracking_token = ${rawToken}
         OR s.tracking_id = ${rawToken}
         OR s.id = ${saleIdQuery}
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "Shipment not found" }, { status: 404 })
    }

    const sale = rows[0]
    const courierServiceName = sale.courier_service_name || sale.master_courier_name || "Standard Courier"
    const courierPartnerName = sale.partner_staff_name || sale.master_courier_name || courierServiceName
    const trackingId = sale.tracking_id || ""

    const courierTrackingUrl = generateCourierTrackingUrl(
      courierServiceName,
      trackingId,
      sale.tracking_url_template
    )

    // Build destination string
    const destinationParts = [sale.shipping_city, sale.shipping_district, sale.shipping_state, sale.shipping_pincode]
      .filter(Boolean)
      .join(", ")

    const destination = destinationParts || "Customer Address"

    // Dates formatting
    const createdAt = sale.created_at ? new Date(sale.created_at) : new Date()
    const updatedAt = sale.updated_at ? new Date(sale.updated_at) : createdAt
    const shippedAt = sale.shipped_at ? new Date(sale.shipped_at) : null
    const deliveredAt = sale.delivered_at ? new Date(sale.delivered_at) : null

    // Build normalized shipment timeline (matching the user's reference design)
    const deliveryStatus = sale.delivery_status || "Pending"
    const statusLower = deliveryStatus.toLowerCase()

    const timeline = []

    // 1. Created / Placed
    timeline.push({
      status: "Dispatched-",
      title: "Order Placed",
      date: format(createdAt, "dd MMM yyyy, hh:mm a"),
      from: "Kottakkal-Hub",
      to: "Kochi-Hub",
    })

    // 2. Processing / Packed
    if (shippedAt || statusLower.includes("pack") || statusLower.includes("sent") || statusLower.includes("ship") || statusLower.includes("transit") || statusLower.includes("deliver")) {
      timeline.push({
        status: "Arrived-",
        title: "In Transit",
        date: format(shippedAt || createdAt, "dd MMM yyyy, hh:mm a"),
        from: "Kochi-Hub",
        to: sale.shipping_city ? `${sale.shipping_city}-Hub` : "Destination Hub",
      })
    }

    // 3. Out for delivery
    if (statusLower.includes("transit") || statusLower.includes("ship") || statusLower.includes("deliver") || statusLower.includes("out")) {
      timeline.push({
        status: "Out for Delivery-",
        title: "Out for Delivery",
        date: format(updatedAt, "dd MMM yyyy, hh:mm a"),
        from: sale.shipping_city ? `${sale.shipping_city}-Branch` : "Local Branch",
        to: sale.shipping_city || "Customer Address",
      })
    }

    // 4. Delivered
    if (deliveredAt || statusLower === "delivered" || statusLower === "complete" || statusLower === "completed") {
      timeline.push({
        status: "Delivered-",
        title: "Delivered",
        date: format(deliveredAt || updatedAt, "dd MMM yyyy, hh:mm a"),
        from: sale.shipping_city ? `${sale.shipping_city}-Branch` : "Local Branch",
        to: sale.shipping_city || "Customer Address",
        contact: sale.customer_phone ? `( ${sale.customer_phone} )` : undefined,
      })
    }

    // Reverse timeline so latest is first (matching screenshot: Delivered- on top)
    timeline.reverse()

    return NextResponse.json({
      success: true,
      data: {
        orderId: `#${sale.id}`,
        deliveryStatus,
        trackingId,
        courierPartnerName,
        courierServiceName,
        courierTrackingUrl,
        currentLocation: sale.shipping_city ? `${sale.shipping_city}-Branch` : "Hub Branch",
        destination,
        contact: sale.customer_phone || "",
        lastUpdate: format(updatedAt, "dd MMM yyyy, hh:mm a"),
        timeline,
      },
    })
  } catch (error: any) {
    console.error("GET /api/track/[token] error:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
