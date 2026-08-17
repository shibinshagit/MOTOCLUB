import { NextRequest, NextResponse } from "next/server"
import {
  syncEcommerceReturnRequest,
  getEcommerceReturnRequests,
} from "@/app/actions/ecommerce-return-actions"

/**
 * Authenticates server-to-server request via API Key or Bearer Token.
 */
function authenticateIntegrationRequest(req: NextRequest): boolean {
  const apiKey = req.headers.get("x-erp-api-key") || req.headers.get("authorization")?.replace("Bearer ", "")
  const expectedApiKey = process.env.ERP_API_KEY || "motoclub_erp_sec_key_2026"

  if (process.env.NODE_ENV === "production" && apiKey !== expectedApiKey) {
    return false
  }
  return true
}

export async function POST(req: NextRequest) {
  try {
    if (!authenticateIntegrationRequest(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Invalid ERP API Key." },
        { status: 401 }
      )
    }

    const body = await req.json()

    const returnRequestId = body.returnRequestId || body.return_request_id || body.id
    const ecommerceOrderId = body.ecommerceOrderId || body.ecommerce_order_id || body.orderNumber || body.order_number

    if (!returnRequestId) {
      return NextResponse.json(
        { success: false, message: "Missing returnRequestId or return_request_id in payload" },
        { status: 400 }
      )
    }
    if (!ecommerceOrderId) {
      return NextResponse.json(
        { success: false, message: "Missing ecommerceOrderId or orderNumber in payload" },
        { status: 400 }
      )
    }

    const result = await syncEcommerceReturnRequest({
      returnRequestId,
      ecommerceOrderId,
      orderNumber: body.orderNumber || body.order_number,
      customerName: body.customerName || body.customer_name,
      customerEmail: body.customerEmail || body.customer_email,
      customerPhone: body.customerPhone || body.customer_phone,
      reason: body.reason || body.return_reason,
      notes: body.notes,
      requestedAt: body.requestedAt || body.requested_at,
      images: body.images,
      items: body.items || [],
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: result.isDuplicate ? 200 : 201 })
  } catch (error: any) {
    console.error("API /api/integrations/ecommerce/returns POST error:", error)
    return NextResponse.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!authenticateIntegrationRequest(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Invalid ERP API Key." },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || undefined
    const search = searchParams.get("search") || undefined

    const result = await getEcommerceReturnRequests({ status, search })
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("API /api/integrations/ecommerce/returns GET error:", error)
    return NextResponse.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
