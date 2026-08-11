import { NextRequest, NextResponse } from "next/server"
import { syncEcommerceOrder } from "@/app/actions/ecommerce-sync-actions"

export async function POST(req: NextRequest) {
  try {
    // 1. AUTHENTICATE SERVER-TO-SERVER REQUEST
    const apiKey = req.headers.get("x-erp-api-key") || req.headers.get("authorization")?.replace("Bearer ", "")
    const expectedApiKey = process.env.ERP_API_KEY || "motoclub_erp_sec_key_2026"

    if (process.env.NODE_ENV === "production" && apiKey !== expectedApiKey) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Invalid ERP API Key." },
        { status: 401 }
      )
    }

    const body = await req.json()

    // 2. PARSE ORDER IDENTIFIER & PAYLOAD
    const orderNumber = body.orderNumber || body.orderId || body.order_number || body.id

    if (!orderNumber) {
      return NextResponse.json(
        { success: false, message: "Missing orderNumber or orderId in payload" },
        { status: 400 }
      )
    }

    const result = await syncEcommerceOrder(orderNumber, {
      orderId: body.orderId || body.id,
      orderNumber: String(orderNumber),
      userId: body.userId || body.user_id,
      customerName: body.customerName || body.customer_name || "Ecommerce Customer",
      customerEmail: body.customerEmail || body.customer_email,
      customerPhone: body.customerPhone || body.customer_phone,
      deliveryAddress: body.deliveryAddress || body.delivery_address,
      subtotal: Number(body.subtotal) || Number(body.totalAmount) || 0,
      deliveryFee: Number(body.deliveryFee || body.delivery_fee) || 0,
      totalAmount: Number(body.totalAmount || body.final_total || body.total_amount) || 0,
      paymentMethod: body.paymentMethod || body.payment_method || "cod",
      paymentStatus: body.paymentStatus || body.payment_status || "pending",
      deliveryStatus: body.deliveryStatus || body.delivery_status || body.status || "pending",
      items: body.items,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 })
  } catch (error: any) {
    console.error("API /api/integrations/ecommerce/orders error:", error)
    return NextResponse.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
