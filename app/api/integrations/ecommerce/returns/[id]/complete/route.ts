import { NextRequest, NextResponse } from "next/server"
import { updateReturnRequestStatus } from "@/app/actions/ecommerce-return-actions"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const apiKey = req.headers.get("x-erp-api-key") || req.headers.get("authorization")?.replace("Bearer ", "")
    const expectedApiKey = process.env.ERP_API_KEY || "motoclub_erp_sec_key_2026"

    if (process.env.NODE_ENV === "production" && apiKey !== expectedApiKey) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Invalid ERP API Key." },
        { status: 401 }
      )
    }

    const returnId = Number(params.id)
    if (isNaN(returnId)) {
      return NextResponse.json({ success: false, message: "Invalid Return ID" }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const deviceId = Number(body.deviceId) || 1
    const staffId = body.staffId ? Number(body.staffId) : null
    const notes = body.notes

    const result = await updateReturnRequestStatus(returnId, "completed", notes, deviceId)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("API complete return error:", error)
    return NextResponse.json(
      { success: false, message: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
